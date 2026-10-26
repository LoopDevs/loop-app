import type { SignedTransfer } from './payment-state.ts';

export type SentPayment = {
  expiryLedger?: number;
  txId?: string;
  transfer?: SignedTransfer;
  at: number;
};

export type SignedRecord = {
  expiryLedger: number;
  transfer: SignedTransfer;
};

export type SentPaymentStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
};

export class SentPayments {
  static readonly keyPrefix = 'payments.sent.';
  static readonly keepMs = 7 * 24 * 60 * 60 * 1000;

  private readonly storage: SentPaymentStorage;
  private readonly now: () => number;

  constructor(storage: SentPaymentStorage, now: () => number = Date.now) {
    this.storage = storage;
    this.now = now;
  }

  static keyOf(paymentId: string): string {
    return `${SentPayments.keyPrefix}${paymentId}`;
  }

  get(paymentId: string): Promise<SentPayment | null> {
    return this.read(SentPayments.keyOf(paymentId));
  }

  async sending(paymentId: string, signed: SignedRecord): Promise<void> {
    await this.write(paymentId, { ...signed, at: this.now() });
    await this.prune().catch(() => undefined);
  }

  async sent(paymentId: string, txId: string): Promise<void> {
    const record = await this.get(paymentId);
    if (record) {
      await this.write(paymentId, { ...record, txId });
    }
  }

  async alreadySubmitted(paymentId: string, txId?: string): Promise<void> {
    const record = await this.get(paymentId);
    if (record) {
      await this.write(paymentId, txId === undefined ? { at: record.at } : { txId, at: record.at });
    }
  }

  forget(paymentId: string): Promise<void> {
    return this.storage.removeItem(SentPayments.keyOf(paymentId));
  }

  private async prune(): Promise<void> {
    const keys = (await this.storage.getAllKeys()).filter((key) => key.startsWith(SentPayments.keyPrefix));
    await Promise.all(
      keys.map(async (key) => {
        if (!(await this.read(key))) {
          await this.storage.removeItem(key);
        }
      }),
    );
  }

  private write(paymentId: string, record: SentPayment): Promise<void> {
    const { transfer, ...rest } = record;
    const stored = transfer ? { ...rest, transfer: SentPayments.storedTransfer(transfer) } : rest;
    return this.storage.setItem(SentPayments.keyOf(paymentId), JSON.stringify(stored));
  }

  private async read(key: string): Promise<SentPayment | null> {
    const stored = await this.storage.getItem(key);
    if (!stored) {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(stored);
    } catch {
      return null;
    }
    const record = SentPayments.parseRecord(parsed);
    return record && record.at >= this.now() - SentPayments.keepMs ? record : null;
  }

  private static storedTransfer({ amount, muxedId }: SignedTransfer): Record<string, string> {
    if (muxedId === undefined) {
      return { amount: amount.toString() };
    }
    return { amount: amount.toString(), muxedId: muxedId.toString() };
  }

  private static parseRecord(value: unknown): SentPayment | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const { expiryLedger, txId, transfer, at } = value as Record<string, unknown>;
    if (typeof at !== 'number' || (expiryLedger !== undefined && typeof expiryLedger !== 'number')) {
      return null;
    }
    const record: SentPayment = { at };
    if (typeof expiryLedger === 'number') {
      record.expiryLedger = expiryLedger;
    }
    if (typeof txId === 'string') {
      record.txId = txId;
    }
    const parsedTransfer = SentPayments.parseTransfer(transfer);
    if (parsedTransfer) {
      record.transfer = parsedTransfer;
    }
    return record;
  }

  private static parseTransfer(value: unknown): SignedTransfer | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const { amount, muxedId } = value as Record<string, unknown>;
    try {
      if (typeof amount !== 'string') {
        return null;
      }
      return typeof muxedId === 'string'
        ? { amount: BigInt(amount), muxedId: BigInt(muxedId) }
        : { amount: BigInt(amount) };
    } catch {
      return null;
    }
  }
}
