import type { PendingWithdrawal } from './savings-top-up.ts';

export type PendingWithdrawalStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export class PendingWithdrawals {
  static readonly keyPrefix = 'savings.withdrawal.';

  private readonly storage: PendingWithdrawalStorage;
  private readonly unsaved = new Map<string, PendingWithdrawal>();

  constructor(storage: PendingWithdrawalStorage) {
    this.storage = storage;
  }

  static keyOf(address: string): string {
    return `${PendingWithdrawals.keyPrefix}${address}`;
  }

  async get(address: string): Promise<PendingWithdrawal | undefined> {
    const stored = PendingWithdrawals.parse(await this.storage.getItem(PendingWithdrawals.keyOf(address)));
    return this.unsaved.get(address) ?? stored;
  }

  async set(address: string, withdrawal: PendingWithdrawal): Promise<void> {
    try {
      await this.storage.setItem(PendingWithdrawals.keyOf(address), JSON.stringify(withdrawal));
      this.unsaved.delete(address);
    } catch (error) {
      this.unsaved.set(address, withdrawal);
      throw error;
    }
  }

  async delete(address: string): Promise<void> {
    this.unsaved.delete(address);
    await this.storage.removeItem(PendingWithdrawals.keyOf(address));
  }

  private static parse(stored: string | null): PendingWithdrawal | undefined {
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
