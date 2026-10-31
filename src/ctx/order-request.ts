import { units } from '../stellar/units.ts';
import type { GiftCard, GiftCardOrderIn } from './client.ts';

export type OrderedCard = Pick<GiftCard, 'merchantId' | 'cardFiatAmount' | 'cardFiatCurrency'>;
export type PlacedCard = OrderedCard & Pick<GiftCard, 'status' | 'created'>;

export class OrderRequest {
  static readonly clockSkewMs = 5 * 60_000;
  readonly asked: GiftCardOrderIn;
  readonly askedAt: number;

  constructor(asked: GiftCardOrderIn, askedAt = 0) {
    this.asked = asked;
    this.askedAt = askedAt;
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

  placed(card: PlacedCard): boolean {
    return (
      card.status === 'unpaid' &&
      this.matches(card) &&
      Date.parse(card.created) >= this.askedAt - OrderRequest.clockSkewMs
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
  private readonly now: () => number;
  private pending: { request: OrderRequest; key: string } | null = null;

  constructor(newKey: () => string, now: () => number) {
    this.newKey = newKey;
    this.now = now;
  }

  keyFor(order: GiftCardOrderIn): string {
    if (!this.pending || !this.pending.request.sameAs(order)) {
      this.pending = {
        request: new OrderRequest({ ...order }, this.now()),
        key: this.newKey(),
      };
    }
    return this.pending.key;
  }

  requestFor(key: string): OrderRequest | null {
    return this.pending?.key === key ? this.pending.request : null;
  }

  settle(key: string): void {
    if (this.pending?.key === key) {
      this.pending = null;
    }
  }
}
