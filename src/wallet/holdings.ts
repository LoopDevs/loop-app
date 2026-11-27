import type { Account } from '../ctx/account.ts';
import type { Rates } from '../ctx/rates.ts';
import { stablePeg, type PaymentCurrency } from '../stellar/network.ts';
import { units } from '../stellar/units.ts';
import { Savings, type SavingsBalance } from './savings.ts';
import type { Balances } from './smart-wallet.ts';

export type SavingsHolding = {
  currency: PaymentCurrency;
  amount: bigint;
};

export type Coverage = { kind: 'wallet' } | { kind: 'savings'; fromSavings: bigint } | { kind: 'short' };

export class Holdings {
  static readonly withdrawSlippageBasisPoints = 100n;
  static readonly shownUnit = units.parse('0.01');

  readonly balances: Balances;
  readonly rates: Rates;

  constructor(balances: Balances, rates: Rates) {
    this.balances = balances;
    this.rates = rates;
  }

  static paidElsewhere(account: Pick<Account, 'payouts'>, address: string): boolean {
    return account.payouts.some(
      (payout) =>
        (payout.isInFlight() || payout.status === 'complete') &&
        payout.address !== undefined &&
        payout.address !== address,
    );
  }

  static floorOf(value: bigint): bigint {
    return (value * (10_000n - Holdings.withdrawSlippageBasisPoints)) / 10_000n;
  }

  static isPaymentCurrency(currency: string): boolean {
    return Object.hasOwn(stablePeg, currency);
  }

  private static shown(sum: bigint): bigint {
    return sum - (sum % Holdings.shownUnit);
  }

  savings(currency: string): bigint {
    const saved = this.balances.savings.find((balance) => balance.currency === currency);
    return saved?.value ?? 0n;
  }

  withdrawableSavings(): SavingsBalance[] {
    return this.balances.savings.filter(({ value }) => Holdings.floorOf(value) > 0n);
  }

  savingsHoldings(): SavingsHolding[] {
    return this.withdrawableSavings().map(({ currency, value }) => ({ currency, amount: value }));
  }

  movableToSavings(): SavingsHolding[] {
    return this.balances.tokens
      .filter(({ token, amount }) => Savings.takes(token.currency) && amount >= Savings.moveMinimum)
      .map(({ token, amount }) => ({ currency: token.currency, amount }));
  }

  inWallet(currency: string): bigint {
    return this.balances.tokens.find(({ token }) => token.currency === currency)?.amount ?? 0n;
  }

  spendable(currency: string): bigint {
    const inWallet = this.inWallet(currency);
    return Savings.takes(currency) ? inWallet + this.savings(currency) : inWallet;
  }

  coverage(currency: string, price: bigint): Coverage {
    const inWallet = this.inWallet(currency);
    if (inWallet >= price) {
      return { kind: 'wallet' };
    }
    if (Savings.takes(currency) && this.spendable(currency) >= price) {
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

  sumIn(amounts: readonly { currency: string; amount: bigint }[], stable: string): bigint | null {
    let sum = 0n;
    for (const { currency, amount } of amounts) {
      const value = this.valueIn(amount, currency, stable);
      if (value === null) {
        return null;
      }
      sum += value;
    }
    return sum;
  }

  inWalletIn(stable: string): bigint | null {
    let sum = 0n;
    for (const { token } of this.balances.tokens) {
      const value = this.valueIn(this.inWallet(token.currency), token.currency, stable);
      if (value === null) {
        return null;
      }
      sum += value;
    }
    return Holdings.shown(sum);
  }

  savedIn(stable: string): bigint | null {
    const sum = this.sumIn(this.savingsHoldings(), stable);
    return sum === null ? null : Holdings.shown(sum);
  }

  totalIn(stable: string): bigint | null {
    const inWallet = this.inWalletIn(stable);
    const saved = this.savedIn(stable);
    return inWallet === null || saved === null ? null : inWallet + saved;
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
      funded.find((currency) => Savings.takes(currency)) ??
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
}
