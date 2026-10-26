import type { Account } from '../ctx/client.ts';
import type { Rates } from '../ctx/rates.ts';
import type { PaymentCurrency } from '../stellar/network.ts';
import { units } from '../stellar/units.ts';
import type { Balances } from './smart-wallet.ts';

export type Holding = {
  currency: string;
  amount: bigint;
};

export class Holdings {
  static readonly savingsCurrency: PaymentCurrency = 'XLM.USDC';
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

  static onTheWayFrom(account: Account): Holding[] {
    const ledger = account.wallet.map(({ currency, amount }) => ({ currency, amount: units.parse(amount) }));
    const payouts = account.payouts
      .filter((payout) => payout.isInFlight())
      .map(({ currency, amount }) => ({ currency, amount: units.parse(amount) }));
    return [...ledger, ...payouts].filter(({ amount }) => amount > 0n);
  }

  static floorOf(value: bigint): bigint {
    return (value * (10_000n - Holdings.withdrawSlippageBasisPoints)) / 10_000n;
  }

  static fallbackCurrency(
    currencies: readonly PaymentCurrency[],
    stable: string,
    refused: ReadonlySet<string>,
  ): PaymentCurrency {
    const open = currencies.filter((currency) => !refused.has(currency));
    return (
      open.find((currency) => currency === stable) ??
      open.find((currency) => currency === Holdings.savingsCurrency) ??
      open[0] ??
      Holdings.savingsCurrency
    );
  }

  savings(): bigint {
    return Holdings.floorOf(this.balances.vaultValue);
  }

  spendable(currency: string): bigint {
    const inWallet = this.balances.tokens.find(({ token }) => token.currency === currency)?.amount ?? 0n;
    return currency === Holdings.savingsCurrency ? inWallet + this.savings() : inWallet;
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
    return this.sumIn(
      this.balances.tokens.map(({ token }) => ({ currency: token.currency, amount: this.spendable(token.currency) })),
      stable,
    );
  }

  onTheWayIn(stable: string): bigint | null {
    return this.onTheWay ? this.sumIn(this.onTheWay, stable) : null;
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
  ): PaymentCurrency {
    let best: { currency: PaymentCurrency; value: bigint } | null = null;
    for (const currency of currencies) {
      const amount = this.spendable(currency);
      const value = refused.has(currency) || amount === 0n ? null : this.valueIn(amount, currency, stable);
      if (value === null) {
        continue;
      }
      if (!best || value > best.value || (value === best.value && currency === stable)) {
        best = { currency, value };
      }
    }
    return best?.currency ?? Holdings.fallbackCurrency(currencies, stable, refused);
  }

  private sumIn(holdings: readonly Holding[], stable: string): bigint | null {
    let sum = 0n;
    for (const { currency, amount } of holdings) {
      const value = this.valueIn(amount, currency, stable);
      if (value === null) {
        return null;
      }
      sum += value;
    }
    return sum - (sum % Holdings.shownUnit);
  }
}
