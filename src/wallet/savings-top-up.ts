import type { PriceWindow } from '../ctx/price-window.ts';
import { money } from '../money.ts';
import { Holdings } from './holdings.ts';
import { Savings } from './savings.ts';
import type { Balances } from './smart-wallet.ts';
import type { PendingVaultCall, SentVaultCall, VaultCall } from './vault-call.ts';

export type TopUpChain = {
  balances(): Promise<Balances>;
  valueOf(shares: bigint): Promise<bigint>;
  withdraw(shares: bigint): Promise<SentVaultCall>;
  vaultCall: VaultCall;
  now(): number;
};

export type TopUpOutcome =
  | { kind: 'covered' }
  | { kind: 'priceClosing' }
  | { kind: 'notEnough' }
  | { kind: 'withdrawFailed' }
  | { kind: 'stillMoving'; withdrawal: PendingVaultCall }
  | { kind: 'priceExpired' }
  | { kind: 'stillShort'; moved: bigint };

export class SavingsTopUp {
  static readonly currency = Savings.currency;
  static readonly requiredWindowMs = 90_000;

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

  async run(price: bigint, window: PriceWindow | null, pending?: PendingVaultCall): Promise<TopUpOutcome> {
    if (pending && (await this.chain.vaultCall.confirm(pending)) === 'pending') {
      return { kind: 'stillMoving', withdrawal: pending };
    }
    const balances = await this.chain.balances();
    const before = SavingsTopUp.inWallet(balances);
    if (before >= price) {
      return { kind: 'covered' };
    }
    const started = await this.withdrawShortfall(price - before, balances, window);
    if (started.kind !== 'sent') {
      return started;
    }
    const { hash, expiryLedger } = started.withdrawal;
    const status = await this.chain.vaultCall.settle(started.withdrawal);
    if (status === 'failed') {
      return { kind: 'withdrawFailed' };
    }
    if (status === 'pending') {
      return { kind: 'stillMoving', withdrawal: { hash, expiryLedger } };
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
  ): Promise<{ kind: 'sent'; withdrawal: SentVaultCall } | TopUpOutcome> {
    if (!window || window.expiresAt - this.chain.now() < SavingsTopUp.requiredWindowMs) {
      return { kind: 'priceClosing' };
    }
    const shares = await this.sharesCovering(shortfall, balances);
    if (shares === null) {
      return { kind: 'notEnough' };
    }
    return { kind: 'sent', withdrawal: await this.chain.withdraw(shares) };
  }
}
