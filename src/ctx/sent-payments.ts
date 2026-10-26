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
  private writes: Promise<void> = Promise.resolve();

  constructor(storage: SentPaymentStorage, now: () => number = Date.now) {
    this.storage = storage;
    this.now = now;
  }

  async get(paymentId: string): Promise<SentPayment | null> {
    return (await this.load())[paymentId] ?? null;
  }

  sending(paymentId: string, expiryLedger: number): Promise<void> {
    return this.update((records) => {
      records[paymentId] = { expiryLedger, at: this.now() };
      return true;
    });
  }

  sent(paymentId: string, txId: string): Promise<void> {
    return this.update((records) => {
      const record = records[paymentId];
      if (!record) {
        return false;
      }
      records[paymentId] = { ...record, txId };
      return true;
    });
  }

  forget(paymentId: string): Promise<void> {
    return this.update((records) => {
      if (!records[paymentId]) {
        return false;
      }
      delete records[paymentId];
      return true;
    });
  }

  private update(change: (records: Records) => boolean): Promise<void> {
    const write = this.writes.then(async () => {
      const records = await this.load();
      if (change(records)) {
        await this.save(records);
      }
    });
    this.writes = write.catch(() => undefined);
    return write;
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
