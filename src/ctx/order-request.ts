import { units } from '../stellar/units.ts';
import type { GiftCard, GiftCardOrderIn } from './client.ts';

export type OrderedCard = Pick<GiftCard, 'merchantId' | 'cardFiatAmount' | 'cardFiatCurrency'>;

export class OrderRequest {
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

  sameAs(order: GiftCardOrderIn): boolean {
    return (
      order.merchantId === this.asked.merchantId &&
      order.fiatAmount === this.asked.fiatAmount &&
      order.fiatCurrency === this.asked.fiatCurrency &&
      order.cryptoCurrency === this.asked.cryptoCurrency
    );
  }
}

export class OrderKeys {
  private readonly newKey: () => string;
  private pending: { request: OrderRequest; key: string } | null = null;

  constructor(newKey: () => string) {
    this.newKey = newKey;
  }

  keyFor(order: GiftCardOrderIn): string {
    if (!this.pending || !this.pending.request.sameAs(order)) {
      this.pending = { request: new OrderRequest({ ...order }), key: this.newKey() };
    }
    return this.pending.key;
  }

  settle(key: string): void {
    if (this.pending?.key === key) {
      this.pending = null;
    }
  }
}
