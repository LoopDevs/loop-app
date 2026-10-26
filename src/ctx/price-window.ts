import type { GiftCard } from './client.ts';

type PricedOrder = Pick<GiftCard, 'paymentMethod' | 'paymentUrlExpiration'>;

export class PriceWindow {
  static readonly closingMs = 30_000;

  readonly expiresAt: number;

  constructor(expiresAt: number) {
    this.expiresAt = expiresAt;
  }

  static of(order: PricedOrder): PriceWindow | null {
    if (order.paymentMethod !== 'crypto' || !order.paymentUrlExpiration) {
      return null;
    }
    const expiresAt = Date.parse(order.paymentUrlExpiration);
    return Number.isNaN(expiresAt) ? null : new PriceWindow(expiresAt);
  }

  isClosed(now: number): boolean {
    return this.expiresAt - now < PriceWindow.closingMs;
  }
}
