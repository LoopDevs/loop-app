import { units } from '../stellar/units.ts';
import type { GiftCard } from './client.ts';
import { Rates } from './rates.ts';

type PricedOrder = Pick<GiftCard, 'paymentCryptoAmount' | 'paymentCryptoCurrency'>;

export type BuyQuote = {
  shown: bigint | null;
  currency: string;
  usdPrice: bigint | null;
};

export type PriceCheck = { kind: 'pay'; price: bigint } | { kind: 'confirm'; price: bigint } | { kind: 'refuse' };

export class BuyPrice {
  static readonly toleranceBasisPoints = 100n;
  static readonly cent = units.parse('0.01');

  private static readonly basisPoints = 10_000n;

  static shown(cardAmount: string, usdPerCardUnit: bigint | null): bigint | null {
    const amount = units.parseTruncated(cardAmount);
    if (amount === null || amount <= 0n || usdPerCardUnit === null) {
      return null;
    }
    return BuyPrice.upToCent(BuyPrice.inUsd(amount, usdPerCardUnit));
  }

  static check(order: PricedOrder, quote: BuyQuote): PriceCheck {
    if (order.paymentCryptoCurrency !== quote.currency || quote.usdPrice === null) {
      return { kind: 'refuse' };
    }
    const amount = units.parseTruncated(order.paymentCryptoAmount ?? '');
    if (amount === null || amount <= 0n) {
      return { kind: 'refuse' };
    }
    const price = BuyPrice.upToCent(BuyPrice.inUsd(amount, quote.usdPrice));
    if (quote.shown === null || !BuyPrice.withinTolerance(price, quote.shown)) {
      return { kind: 'confirm', price };
    }
    return { kind: 'pay', price };
  }

  static dollars(price: bigint): string {
    return units.format(price, 2);
  }

  private static withinTolerance(price: bigint, shown: bigint): boolean {
    return price * BuyPrice.basisPoints <= shown * (BuyPrice.basisPoints + BuyPrice.toleranceBasisPoints);
  }

  private static inUsd(amount: bigint, usdPrice: bigint): bigint {
    return (amount * usdPrice + Rates.one - 1n) / Rates.one;
  }

  private static upToCent(value: bigint): bigint {
    return ((value + BuyPrice.cent - 1n) / BuyPrice.cent) * BuyPrice.cent;
  }
}
