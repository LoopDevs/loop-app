import AsyncStorage from '@react-native-async-storage/async-storage';

import { BankPayment } from './bank-payment.ts';
import { ctx, type GiftCard } from './client.ts';
import { OneTapBuy } from './one-tap-buy.ts';

export type DismissedOrderStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export class DismissedOrders {
  static readonly key = 'loop.dismissedOrders';
  static readonly keep = 20;

  private readonly storage: DismissedOrderStorage;
  private ids: string[] | null = null;

  constructor(storage: DismissedOrderStorage) {
    this.storage = storage;
  }

  static cancellable(order: Pick<GiftCard, 'status' | 'paymentStatus' | 'paymentCryptoTxId'>): boolean {
    return order.status === 'unpaid' && !OneTapBuy.paymentStarted(order, false);
  }

  static hidden(order: GiftCard, ids: ReadonlySet<string>): boolean {
    return DismissedOrders.cancellable(order) && (ids.has(order.id) || BankPayment.isBank(order));
  }

  static parse(stored: string | null): string[] {
    if (!stored) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  }

  async load(): Promise<ReadonlySet<string>> {
    if (!this.ids) {
      this.ids = DismissedOrders.parse(await this.storage.getItem(DismissedOrders.key).catch(() => null));
    }
    return new Set(this.ids);
  }

  async dismiss(order: GiftCard): Promise<void> {
    const kept = [...(await this.load())].filter((id) => id !== order.id);
    this.ids = [...kept, order.id].slice(-DismissedOrders.keep);
    await this.storage.setItem(DismissedOrders.key, JSON.stringify(this.ids)).catch(() => undefined);
  }

  async activeOrder(merchantId?: string): Promise<GiftCard | null> {
    const ids = await this.load();
    return ctx.activeGiftCard(merchantId, (order) => DismissedOrders.hidden(order, ids));
  }
}

export const dismissedOrders = new DismissedOrders(AsyncStorage);
