import type { SponsoredResult } from '../ctx/client.ts';
import type { PriceWindow } from '../ctx/price-window.ts';
import { money } from '../money.ts';
import { Holdings } from './holdings.ts';
import type { Balances } from './smart-wallet.ts';

export type TopUpChain = {
  balances(): Promise<Balances>;
  valueOf(shares: bigint): Promise<bigint>;
  withdraw(shares: bigint): Promise<SponsoredResult>;
  transactionStatus(hash: string): Promise<'pending' | 'success' | 'failed'>;
  sleep(ms: number): Promise<void>;
  now(): number;
};

export type TopUpOutcome =
  | { kind: 'covered' }
  | { kind: 'priceClosing' }
  | { kind: 'notEnough' }
  | { kind: 'withdrawFailed' }
  | { kind: 'stillMoving'; hash: string }
  | { kind: 'priceExpired' }
  | { kind: 'stillShort'; moved: bigint };

export class SavingsTopUp {
  static readonly currency = Holdings.savingsCurrency;
  static readonly requiredWindowMs = 90_000;
  static readonly confirmTimeoutMs = 30_000;
  static readonly confirmPollMs = 2_000;

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

  async run(price: bigint, window: PriceWindow | null, pendingHash?: string): Promise<TopUpOutcome> {
    const balances = await this.chain.balances();
    const before = SavingsTopUp.inWallet(balances);
    let hash = pendingHash;
    if (hash === undefined) {
      if (before >= price) {
        return { kind: 'covered' };
      }
      const started = await this.withdrawShortfall(price - before, balances, window);
      if (started.kind !== 'sent') {
        return started;
      }
      hash = started.hash;
    }
    const status = await this.confirm(hash);
    if (status === 'failed') {
      return { kind: 'withdrawFailed' };
    }
    if (status === 'pending') {
      return { kind: 'stillMoving', hash };
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
  ): Promise<{ kind: 'sent'; hash: string } | TopUpOutcome> {
    if (!window || window.expiresAt - this.chain.now() < SavingsTopUp.requiredWindowMs) {
      return { kind: 'priceClosing' };
    }
    const shares = await this.sharesCovering(shortfall, balances);
    if (shares === null) {
      return { kind: 'notEnough' };
    }
    const result = await this.chain.withdraw(shares);
    if (result.error || result.status === 'failed' || !result.hash) {
      return { kind: 'withdrawFailed' };
    }
    return { kind: 'sent', hash: result.hash };
  }

  private async confirm(hash: string): Promise<'pending' | 'success' | 'failed'> {
    const deadline = this.chain.now() + SavingsTopUp.confirmTimeoutMs;
    for (;;) {
      const status = await this.chain.transactionStatus(hash).catch(() => 'pending' as const);
      if (status !== 'pending' || this.chain.now() >= deadline) {
        return status;
      }
      await this.chain.sleep(SavingsTopUp.confirmPollMs);
    }
  }
}
