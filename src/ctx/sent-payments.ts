export type SentPayment = {
  expiryLedger: number;
  txId?: string;
  at: number;
};

export type SentPaymentStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

type Records = Record<string, SentPayment>;

export class SentPayments {
  static readonly storageKey = 'payments.sent';
  static readonly keepMs = 7 * 24 * 60 * 60 * 1000;

  private readonly storage: SentPaymentStorage;
  private readonly now: () => number;

  constructor(storage: SentPaymentStorage, now: () => number = Date.now) {
    this.storage = storage;
    this.now = now;
  }

  async get(paymentId: string): Promise<SentPayment | null> {
    return (await this.load())[paymentId] ?? null;
  }

  async sending(paymentId: string, expiryLedger: number): Promise<void> {
    const records = await this.load();
    records[paymentId] = { expiryLedger, at: this.now() };
    await this.save(records);
  }

  async sent(paymentId: string, txId: string): Promise<void> {
    const records = await this.load();
    const record = records[paymentId];
    if (record) {
      records[paymentId] = { ...record, txId };
      await this.save(records);
    }
  }

  async forget(paymentId: string): Promise<void> {
    const records = await this.load();
    if (records[paymentId]) {
      delete records[paymentId];
      await this.save(records);
    }
  }

  private async load(): Promise<Records> {
    const stored = await this.storage.getItem(SentPayments.storageKey);
    const records: Records = {};
    if (!stored) {
      return records;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(stored);
    } catch {
      return records;
    }
    if (!parsed || typeof parsed !== 'object') {
      return records;
    }
    const oldest = this.now() - SentPayments.keepMs;
    for (const [paymentId, value] of Object.entries(parsed as Record<string, unknown>)) {
      const record = SentPayments.parseRecord(value);
      if (record && record.at >= oldest) {
        records[paymentId] = record;
      }
    }
    return records;
  }

  private save(records: Records): Promise<void> {
    return this.storage.setItem(SentPayments.storageKey, JSON.stringify(records));
  }

  private static parseRecord(value: unknown): SentPayment | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const { expiryLedger, txId, at } = value as Record<string, unknown>;
    if (typeof expiryLedger !== 'number' || typeof at !== 'number') {
      return null;
    }
    return typeof txId === 'string' ? { expiryLedger, txId, at } : { expiryLedger, at };
  }
}
