import type { PaymentCurrency } from '../stellar/network.ts';
import type { PendingVaultCall } from './vault-call.ts';

export type PendingWithdrawalStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export class PendingWithdrawals {
  static readonly keyPrefix = 'savings.withdrawal.';

  private readonly storage: PendingWithdrawalStorage;
  private readonly unsaved = new Map<string, PendingVaultCall>();

  constructor(storage: PendingWithdrawalStorage) {
    this.storage = storage;
  }

  static keyOf(address: string, currency: PaymentCurrency): string {
    return `${PendingWithdrawals.keyPrefix}${address}.${currency}`;
  }

  async get(address: string, currency: PaymentCurrency): Promise<PendingVaultCall | undefined> {
    const key = PendingWithdrawals.keyOf(address, currency);
    const stored = PendingWithdrawals.parse(await this.storage.getItem(key));
    return this.unsaved.get(key) ?? stored;
  }

  async set(address: string, currency: PaymentCurrency, withdrawal: PendingVaultCall): Promise<void> {
    const key = PendingWithdrawals.keyOf(address, currency);
    try {
      await this.storage.setItem(key, JSON.stringify(withdrawal));
      this.unsaved.delete(key);
    } catch (error) {
      this.unsaved.set(key, withdrawal);
      throw error;
    }
  }

  async delete(address: string, currency: PaymentCurrency): Promise<void> {
    const key = PendingWithdrawals.keyOf(address, currency);
    this.unsaved.delete(key);
    await this.storage.removeItem(key);
  }

  private static parse(stored: string | null): PendingVaultCall | undefined {
    if (!stored) {
      return undefined;
    }
    let value: unknown;
    try {
      value = JSON.parse(stored);
    } catch {
      return undefined;
    }
    if (!value || typeof value !== 'object') {
      return undefined;
    }
    const { hash, expiryLedger } = value as Record<string, unknown>;
    if (typeof hash !== 'string' || typeof expiryLedger !== 'number') {
      return undefined;
    }
    return { hash, expiryLedger };
  }
}
