import type { SponsoredResult } from '../ctx/client.ts';
import { CtxError } from '../ctx/ctx-error.ts';
import { chainOutcome } from '../ctx/payment-state.ts';
import type { PriceWindow } from '../ctx/price-window.ts';
import { money } from '../money.ts';
import { Holdings } from './holdings.ts';
import { Savings } from './savings.ts';
import type { Balances } from './smart-wallet.ts';

export type PendingWithdrawal = {
  hash: string;
  expiryLedger: number;
};

export type SentWithdrawal = SponsoredResult & { expiryLedger: number };

export type SignedWithdrawal = {
  expiryLedger: number;
  sponsor(): Promise<SponsoredResult>;
};

export type ChainTransaction = {
  status: string;
  latestLedger: number;
};

export type TopUpChain = {
  balances(): Promise<Balances>;
  valueOf(shares: bigint): Promise<bigint>;
  signWithdrawal(shares: bigint): Promise<SignedWithdrawal>;
  transaction(hash: string): Promise<ChainTransaction>;
  latestLedger(): Promise<number>;
  sleep(ms: number): Promise<void>;
  now(): number;
};

export type TopUpOutcome =
  | { kind: 'covered'; withdrawal?: PendingWithdrawal }
  | { kind: 'priceClosing' }
  | { kind: 'notEnough' }
  | { kind: 'withdrawFailed' }
  | { kind: 'stillMoving'; withdrawal: PendingWithdrawal }
  | { kind: 'priceExpired' }
  | { kind: 'stillShort'; moved: bigint };

type ChainOutcome = 'pending' | 'success' | 'failed';

export class UnansweredWithdrawal extends Error {
  readonly expiryLedger: number;

  constructor(expiryLedger: number, cause: unknown) {
    super("We couldn't confirm the move from savings. Check your balance in a few minutes.", { cause });
    this.name = 'UnansweredWithdrawal';
    this.expiryLedger = expiryLedger;
  }

  static rethrow(error: unknown, expiryLedger: number): never {
    if (error instanceof CtxError && error.status >= 400 && error.status < 500) {
      throw error;
    }
    throw new UnansweredWithdrawal(expiryLedger, error);
  }
}

export class SavingsTopUp {
  static readonly currency = Savings.currency;
  static readonly requiredWindowMs = 90_000;
  static readonly confirmTimeoutMs = 30_000;
  static readonly confirmPollMs = 2_000;
  static readonly withdrawAttempts = 2;

  readonly chain: TopUpChain;

  constructor(chain: TopUpChain) {
    this.chain = chain;
  }

  static estimatedShares(shortfall: bigint, vaultShares: bigint, vaultValue: bigint): bigint {
    if (shortfall <= 0n || vaultShares <= 0n || vaultValue <= 0n) {
      return 0n;
    }
    const numerator = shortfall * 10_000n * vaultShares;
    const denominator = (10_000n - Holdings.withdrawSlippageBasisPoints) * vaultValue;
    const shares = (numerator + denominator - 1n) / denominator;
    return shares < vaultShares ? shares : vaultShares;
  }

  static outcomeOf(transaction: ChainTransaction, withdrawal: PendingWithdrawal): ChainOutcome {
    if (transaction.status === 'NOT_FOUND' && transaction.latestLedger > withdrawal.expiryLedger) {
      return 'failed';
    }
    return chainOutcome(transaction.status);
  }

  static async send(signed: SignedWithdrawal): Promise<SentWithdrawal> {
    const result = await signed
      .sponsor()
      .catch((error: unknown) => UnansweredWithdrawal.rethrow(error, signed.expiryLedger));
    return { ...result, expiryLedger: signed.expiryLedger };
  }

  static refusedWithdrawal(error: unknown): SentWithdrawal {
    if (error instanceof CtxError && error.status === 400) {
      return { hash: '', status: 'failed', error: error.message, expiryLedger: 0 };
    }
    throw error;
  }

  static notEnough(symbol: string): string {
    return `Not enough ${symbol}`;
  }

  static message(outcome: TopUpOutcome, symbol: string): string {
    switch (outcome.kind) {
      case 'covered':
        return '';
      case 'priceClosing':
        return 'This price is about to expire';
      case 'notEnough':
        return SavingsTopUp.notEnough(symbol);
      case 'withdrawFailed':
        return "Couldn't move funds from savings";
      case 'stillMoving':
        return 'Still moving funds from savings, try again shortly';
      case 'priceExpired':
        return 'This price expired; the funds are in your wallet';
      case 'stillShort':
        return `Moved ${money.token(outcome.moved, SavingsTopUp.currency)} to your wallet, not enough to pay`;
    }
  }

  private static inWallet(balances: Balances): bigint {
    return balances.tokens.find(({ token }) => token.currency === SavingsTopUp.currency)?.amount ?? 0n;
  }

  async run(price: bigint, window: PriceWindow | null, pending?: PendingWithdrawal): Promise<TopUpOutcome> {
    let balances = await this.chain.balances();
    if (SavingsTopUp.inWallet(balances) >= price) {
      return pending && (await this.status(pending)) === 'pending'
        ? { kind: 'covered', withdrawal: pending }
        : { kind: 'covered' };
    }
    if (pending) {
      if ((await this.confirm(pending)) === 'pending') {
        return { kind: 'stillMoving', withdrawal: pending };
      }
      balances = await this.chain.balances();
    }
    const before = SavingsTopUp.inWallet(balances);
    if (before >= price) {
      return { kind: 'covered' };
    }
    const started = await this.withdrawShortfall(price - before, balances, window);
    if (started.kind !== 'sent') {
      return started;
    }
    const status = await this.confirm(started.withdrawal);
    if (status === 'failed') {
      return { kind: 'withdrawFailed' };
    }
    if (status === 'pending') {
      return { kind: 'stillMoving', withdrawal: started.withdrawal };
    }
    const after = SavingsTopUp.inWallet(await this.chain.balances());
    if (!window || window.isClosed(this.chain.now())) {
      return { kind: 'priceExpired' };
    }
    if (after < price) {
      return { kind: 'stillShort', moved: after > before ? after - before : 0n };
    }
    return { kind: 'covered' };
  }

  async sharesCovering(shortfall: bigint, { vaultShares, vaultValue }: Balances): Promise<bigint | null> {
    const estimate = SavingsTopUp.estimatedShares(shortfall, vaultShares, vaultValue);
    if (estimate === 0n) {
      return null;
    }
    for (const shares of [estimate, estimate + 1n]) {
      if (shares > vaultShares) {
        return null;
      }
      if (Holdings.floorOf(await this.chain.valueOf(shares)) >= shortfall) {
        return shares;
      }
    }
    return null;
  }

  private async withdrawShortfall(
    shortfall: bigint,
    balances: Balances,
    window: PriceWindow | null,
  ): Promise<{ kind: 'sent'; withdrawal: PendingWithdrawal } | TopUpOutcome> {
    let vault = balances;
    for (let attempt = 1; ; attempt += 1) {
      if (!window || window.expiresAt - this.chain.now() < SavingsTopUp.requiredWindowMs) {
        return { kind: 'priceClosing' };
      }
      const shares = await this.sharesCovering(shortfall, vault);
      if (shares === null) {
        return { kind: 'notEnough' };
      }
      let result: SentWithdrawal;
      try {
        result = await SavingsTopUp.send(await this.chain.signWithdrawal(shares));
      } catch (error) {
        if (error instanceof UnansweredWithdrawal) {
          return { kind: 'stillMoving', withdrawal: { hash: '', expiryLedger: error.expiryLedger } };
        }
        result = SavingsTopUp.refusedWithdrawal(error);
      }
      if (result.hash && !result.error && result.status !== 'failed') {
        return { kind: 'sent', withdrawal: { hash: result.hash, expiryLedger: result.expiryLedger } };
      }
      if (result.hash || attempt >= SavingsTopUp.withdrawAttempts) {
        return { kind: 'withdrawFailed' };
      }
      vault = await this.chain.balances();
    }
  }

  private async confirm(withdrawal: PendingWithdrawal): Promise<ChainOutcome> {
    const deadline = this.chain.now() + SavingsTopUp.confirmTimeoutMs;
    for (;;) {
      const status = await this.status(withdrawal);
      if (status !== 'pending' || this.chain.now() >= deadline) {
        return status;
      }
      await this.chain.sleep(SavingsTopUp.confirmPollMs);
    }
  }

  private status(withdrawal: PendingWithdrawal): Promise<ChainOutcome> {
    if (!withdrawal.hash) {
      return this.unansweredStatus(withdrawal);
    }
    return this.chain.transaction(withdrawal.hash).then(
      (transaction) => SavingsTopUp.outcomeOf(transaction, withdrawal),
      () => 'pending' as const,
    );
  }

  private async unansweredStatus(withdrawal: PendingWithdrawal): Promise<ChainOutcome> {
    try {
      return (await this.chain.latestLedger()) > withdrawal.expiryLedger ? 'failed' : 'pending';
    } catch {
      return 'pending';
    }
  }
}
