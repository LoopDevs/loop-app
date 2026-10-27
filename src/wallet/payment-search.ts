import { transferLanded, type SignedTransfer } from '../ctx/payment-state.ts';
import type { LedgerRange } from '../stellar/transfer-events.ts';
import { SponsoredCall } from './sponsored-call.ts';

export type LedgerRetention = {
  oldestLedger: number;
  latestLedger: number;
};

export type TransferSource = {
  transfers(contractId: string, from: string, to: string, ledgers: LedgerRange): Promise<unknown[]>;
  retention(): Promise<LedgerRetention>;
};

export type TimeSpan = {
  from: number;
  to: number;
};

export class PaymentSearch {
  static readonly fastestLedgerMs = 4_000;
  static readonly slowestLedgerMs = 7_000;

  private readonly source: TransferSource;
  private readonly from: string;
  private readonly to: string;

  constructor(source: TransferSource, from: string, to: string) {
    this.source = source;
    this.from = from;
    this.to = to;
  }

  static ledgers(expiryLedger: number): LedgerRange {
    return {
      startLedger: expiryLedger - SponsoredCall.maxExpiryLedgers,
      endLedger: expiryLedger + 1,
    };
  }

  static ledgersDuring(retention: LedgerRetention, span: TimeSpan, now: number): LedgerRange | null {
    const { oldestLedger, latestLedger } = retention;
    const ledgersBack = Math.ceil((now - span.from) / PaymentSearch.fastestLedgerMs);
    const ledgersAfter = Math.floor((now - span.to) / PaymentSearch.slowestLedgerMs);
    const startLedger = Math.max(oldestLedger, latestLedger - ledgersBack - SponsoredCall.maxExpiryLedgers);
    const endLedger = Math.min(latestLedger, latestLedger - ledgersAfter + SponsoredCall.maxExpiryLedgers) + 1;
    return startLedger < endLedger ? { startLedger, endLedger } : null;
  }

  async landed(contractId: string, expected: SignedTransfer | null, expiryLedger: number): Promise<boolean> {
    const transfers = await this.source.transfers(contractId, this.from, this.to, PaymentSearch.ledgers(expiryLedger));
    return transferLanded(transfers, expected);
  }

  async landedDuring(contractId: string, expected: SignedTransfer, span: TimeSpan, now: number): Promise<boolean> {
    const ledgers = PaymentSearch.ledgersDuring(await this.source.retention(), span, now);
    if (!ledgers) {
      return false;
    }
    return transferLanded(await this.source.transfers(contractId, this.from, this.to, ledgers), expected);
  }
}
