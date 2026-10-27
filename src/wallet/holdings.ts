import type { Account } from '../ctx/account.ts';
import type { Rates } from '../ctx/rates.ts';
import { stablePeg, type PaymentCurrency } from '../stellar/network.ts';
import { units } from '../stellar/units.ts';
import { Savings } from './savings.ts';
import type { Balances } from './smart-wallet.ts';

export type Holding = {
  currency: string;
  amount: bigint;
  estimates?: Readonly<Record<string, string>>;
};

export type Coverage = { kind: 'wallet' } | { kind: 'savings'; fromSavings: bigint } | { kind: 'short' };

export class Holdings {
  static readonly withdrawSlippageBasisPoints = 100n;
  static readonly shownUnit = units.parse('0.01');

  readonly balances: Balances;
  readonly onTheWay: Holding[] | null;
  readonly rates: Rates;

  constructor(balances: Balances, onTheWay: Holding[] | null, rates: Rates) {
    this.balances = balances;
    this.onTheWay = onTheWay;
    this.rates = rates;
  }

  static onTheWayFrom(account: Pick<Account, 'wallet' | 'payouts'>, address: string): Holding[] {
    const ledger = account.wallet.flatMap(({ currency, amount, estimates }) =>
      Holdings.holdingOf(currency, amount, estimates),
    );
    const payouts = account.payouts
      .filter((payout) => payout.isInFlight() && payout.address === address)
      .flatMap((payout) => Holdings.holdingOf(payout.currency, payout.netAmount()));
    return [...ledger, ...payouts];
  }

  static floorOf(value: bigint): bigint {
    return (value * (10_000n - Holdings.withdrawSlippageBasisPoints)) / 10_000n;
  }

  static isPaymentCurrency(currency: string): boolean {
    return Object.hasOwn(stablePeg, currency);
  }

  private static holdingOf(currency: string, amount: string, estimates?: Record<string, string>): Holding[] {
    const parsed = units.parseTruncated(amount);
    return parsed !== null && parsed > 0n ? [{ currency, amount: parsed, estimates }] : [];
  }

  private static shown(sum: bigint): bigint {
    return sum - (sum % Holdings.shownUnit);
  }

  savings(): bigint {
    return Holdings.floorOf(this.balances.vaultValue);
  }

  inWallet(currency: string): bigint {
    return this.balances.tokens.find(({ token }) => token.currency === currency)?.amount ?? 0n;
  }

  spendable(currency: string): bigint {
    const inWallet = this.inWallet(currency);
    return currency === Savings.currency ? inWallet + this.savings() : inWallet;
  }

  coverage(currency: string, price: bigint): Coverage {
    const inWallet = this.inWallet(currency);
    if (inWallet >= price) {
      return { kind: 'wallet' };
    }
    if (currency === Savings.currency &&this.spendable(currency) >= price) {
      return { kind: 'savings', fromSavings: price - inWallet };
    }
    return { kind: 'short' };
  }

  valueIn(amount: bigint, currency: string, stable: string): bigint | null {
    if (currency === stable || amount === 0n) {
      return amount;
    }
    const price = this.rates.usdPrice(currency);
    const stablePrice = this.rates.usdPrice(stable);
    if (price === null || stablePrice === null) {
      return null;
    }
    return (amount * price) / stablePrice;
  }

  spendableIn(stable: string): bigint | null {
    let sum = 0n;
    for (const { token } of this.balances.tokens) {
      const value = this.valueIn(this.spendable(token.currency), token.currency, stable);
      if (value === null) {
        return null;
      }
      sum += value;
    }
    return Holdings.shown(sum);
  }

  onTheWayIn(stable: string): bigint | null {
    if (!this.onTheWay) {
      return null;
    }
    let sum = 0n;
    for (const holding of this.onTheWay) {
      const value = this.estimateIn(holding, stable);
      if (value !== null) {
        sum += value;
      } else if (Holdings.isPaymentCurrency(holding.currency)) {
        return null;
      }
    }
    return Holdings.shown(sum);
  }

  totalIn(stable: string): bigint | null {
    const spendable = this.spendableIn(stable);
    const onTheWay = this.onTheWayIn(stable);
    return spendable === null || onTheWay === null ? null : spendable + onTheWay;
  }

  preferredCurrency(
    currencies: readonly PaymentCurrency[],
    stable: string,
    refused: ReadonlySet<string>,
  ): PaymentCurrency | null {
    const funded = currencies.filter((currency) => !refused.has(currency) && this.spendable(currency) > 0n);
    let best: { currency: PaymentCurrency; value: bigint } | null = null;
    for (const currency of funded) {
      const value = this.rankingValue(currency, stable);
      if (value === null) {
        continue;
      }
      if (!best || value > best.value || (value === best.value && currency === stable)) {
        best = { currency, value };
      }
    }
    return (
      best?.currency ??
      funded.find((currency) => currency === stable) ??
      funded.find((currency) => currency === Savings.currency) ??
      funded[0] ??
      null
    );
  }

  private rankingValue(currency: PaymentCurrency, stable: string): bigint | null {
    const amount = this.spendable(currency);
    const value = this.valueIn(amount, currency, stable);
    const comparableByPeg = stablePeg[currency] !== null && this.rates.usdPrice(currency) !== null;
    return value ?? (comparableByPeg ? amount : null);
  }

  private estimateIn(holding: Holding, stable: string): bigint | null {
    if (holding.currency === stable) {
      return holding.amount;
    }
    const estimate = holding.estimates?.[stable];
    const parsed = estimate === undefined ? null : units.parseTruncated(estimate);
    return parsed ?? this.valueIn(holding.amount, holding.currency, stable);
  }
}
