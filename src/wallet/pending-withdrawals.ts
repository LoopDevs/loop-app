import type { PendingWithdrawal } from './savings-top-up.ts';

export type PendingWithdrawalStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export class PendingWithdrawals {
  static readonly keyPrefix = 'savings.withdrawal.';

  private readonly storage: PendingWithdrawalStorage;
  private readonly known = new Map<string, PendingWithdrawal>();

  constructor(storage: PendingWithdrawalStorage) {
    this.storage = storage;
  }

  static keyOf(address: string): string {
    return `${PendingWithdrawals.keyPrefix}${address}`;
  }

  has(address: string): boolean {
    return this.known.has(address);
  }

  async get(address: string): Promise<PendingWithdrawal | undefined> {
    const known = this.known.get(address);
    if (known) {
      return known;
    }
    const stored = PendingWithdrawals.parse(await this.storage.getItem(PendingWithdrawals.keyOf(address)));
    if (stored) {
      this.known.set(address, stored);
    }
    return stored;
  }

  async set(address: string, withdrawal: PendingWithdrawal): Promise<void> {
    this.known.set(address, withdrawal);
    await this.storage.setItem(PendingWithdrawals.keyOf(address), JSON.stringify(withdrawal));
  }

  async delete(address: string): Promise<void> {
    this.known.delete(address);
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
