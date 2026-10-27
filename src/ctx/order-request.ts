import { units } from '../stellar/units.ts';
import type { GiftCard, GiftCardOrderIn } from './client.ts';

export type OrderedCard = Pick<GiftCard, 'merchantId' | 'cardFiatAmount' | 'cardFiatCurrency'>;

export class OrderRequest {
  static readonly mismatchMessage = "That order didn't match what you asked for, so we didn't pay it. Try again.";

  readonly asked: GiftCardOrderIn;

  constructor(asked: GiftCardOrderIn) {
    this.asked = asked;
  }

  matches(card: OrderedCard): boolean {
    const amount = units.parseTruncated(card.cardFiatAmount);
    return (
      card.merchantId === this.asked.merchantId &&
      card.cardFiatCurrency.toUpperCase() === this.asked.fiatCurrency.toUpperCase() &&
      amount !== null &&
      amount === units.parseTruncated(this.asked.fiatAmount)
    );
  }

  require<T extends OrderedCard>(card: T): T {
    if (!this.matches(card)) {
      throw new Error(OrderRequest.mismatchMessage);
    }
    return card;
  }
}
