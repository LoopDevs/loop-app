import type { SponsoredResult } from '../ctx/client.ts';
import { CtxError } from '../ctx/ctx-error.ts';
import type { PriceWindow } from '../ctx/price-window.ts';
import { money } from '../money.ts';
import type { PaymentCurrency } from '../stellar/network.ts';
import { Holdings } from './holdings.ts';
import type { Balances } from './smart-wallet.ts';
import { VaultCall, type PendingVaultCall, type SentVaultCall } from './vault-call.ts';

export type SignedWithdrawal = {
  expiryLedger: number;
  sponsor(): Promise<SponsoredResult>;
};

export type TopUpChain = {
  balances(): Promise<Balances>;
  valueOf(shares: bigint): Promise<bigint>;
  signWithdrawal(shares: bigint): Promise<SignedWithdrawal>;
  vaultCall: VaultCall;
  now(): number;
};

export type TopUpOutcome =
  | { kind: 'covered'; withdrawal?: PendingVaultCall }
  | { kind: 'priceClosing' }
  | { kind: 'notEnough' }
  | { kind: 'withdrawFailed' }
  | { kind: 'stillMoving'; withdrawal: PendingVaultCall }
  | { kind: 'priceExpired' }
  | { kind: 'stillShort'; moved: bigint; currency: PaymentCurrency };

export class UnansweredWithdrawal extends Error {
  readonly expiryLedger: number;

  constructor(expiryLedger: number, cause: unknown) {
    super("We couldn't confirm the move from savings. Check your balance in a few minutes.", { cause });
    this.name = 'UnansweredWithdrawal';
    this.expiryLedger = expiryLedger;
  }

  static rethrow(error: unknown, expiryLedger: number): never {
    if (VaultCall.refusedBySponsor(error)) {
      throw error;
    }
    throw new UnansweredWithdrawal(expiryLedger, error);
  }
}

export class SavingsTopUp {
  static readonly requiredWindowMs = 90_000;
  static readonly withdrawAttempts = 2;

  readonly chain: TopUpChain;
  readonly currency: PaymentCurrency;

  constructor(chain: TopUpChain, currency: PaymentCurrency) {
    this.chain = chain;
    this.currency = currency;
  }

  static estimatedShares(shortfall: bigint, savedShares: bigint, savedValue: bigint): bigint {
    if (shortfall <= 0n || savedShares <= 0n || savedValue <= 0n) {
      return 0n;
    }
    const numerator = shortfall * 10_000n * savedShares;
    const denominator = (10_000n - Holdings.withdrawSlippageBasisPoints) * savedValue;
    const shares = (numerator + denominator - 1n) / denominator;
    return shares < savedShares ? shares : savedShares;
  }

  static async send(signed: SignedWithdrawal): Promise<SentVaultCall> {
    const result = await signed
      .sponsor()
      .catch((error: unknown) => UnansweredWithdrawal.rethrow(error, signed.expiryLedger));
    return { ...result, expiryLedger: signed.expiryLedger };
  }

  static refusedWithdrawal(error: unknown): SentVaultCall {
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
        return `Moved ${money.token(outcome.moved, outcome.currency)} to your wallet, not enough to pay`;
    }
  }

  private inWallet(balances: Balances): bigint {
    return balances.tokens.find(({ token }) => token.currency === this.currency)?.amount ?? 0n;
  }

  private saved(balances: Balances): { shares: bigint; value: bigint } {
    return balances.savings.find((saved) => saved.currency === this.currency) ?? { shares: 0n, value: 0n };
  }

  async run(price: bigint, window: PriceWindow | null, pending?: PendingVaultCall): Promise<TopUpOutcome> {
    const { vaultCall } = this.chain;
    let balances = await this.chain.balances();
    if (this.inWallet(balances) >= price) {
      return pending && (await vaultCall.status(pending)) === 'pending'
        ? { kind: 'covered', withdrawal: pending }
        : { kind: 'covered' };
    }
    if (pending) {
      if ((await vaultCall.confirm(pending)) === 'pending') {
        return { kind: 'stillMoving', withdrawal: pending };
      }
      balances = await this.chain.balances();
    }
    const before = this.inWallet(balances);
    if (before >= price) {
      return { kind: 'covered' };
    }
    const started = await this.withdrawShortfall(price - before, balances, window);
    if (started.kind !== 'sent') {
      return started;
    }
    const status = await vaultCall.confirm(started.withdrawal);
    if (status === 'failed') {
      return { kind: 'withdrawFailed' };
    }
    if (status === 'pending') {
      return { kind: 'stillMoving', withdrawal: started.withdrawal };
    }
    const after = this.inWallet(await this.chain.balances());
    if (!window || window.isClosed(this.chain.now())) {
      return { kind: 'priceExpired' };
    }
    if (after < price) {
      return { kind: 'stillShort', moved: after > before ? after - before : 0n, currency: this.currency };
    }
    return { kind: 'covered' };
  }

  async sharesCovering(shortfall: bigint, balances: Balances): Promise<bigint | null> {
    const saved = this.saved(balances);
    const estimate = SavingsTopUp.estimatedShares(shortfall, saved.shares, saved.value);
    if (estimate === 0n) {
      return null;
    }
    for (const shares of [estimate, estimate + 1n]) {
      if (shares > saved.shares) {
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
  ): Promise<{ kind: 'sent'; withdrawal: PendingVaultCall } | TopUpOutcome> {
    let vault = balances;
    for (let attempt = 1; ; attempt += 1) {
      if (!window || window.expiresAt - this.chain.now() < SavingsTopUp.requiredWindowMs) {
        return { kind: 'priceClosing' };
      }
      const shares = await this.sharesCovering(shortfall, vault);
      if (shares === null) {
        return { kind: 'notEnough' };
      }
      let result: SentVaultCall;
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
}
