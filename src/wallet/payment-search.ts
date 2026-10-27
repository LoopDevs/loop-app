import { landingClosed, transferLanded, type SignedTransfer } from '../ctx/payment-state.ts';
import type { LedgerRange } from '../stellar/transfer-events.ts';
import { SponsoredCall } from './sponsored-call.ts';

export type TransferSearchResult = {
  transfers: unknown[];
  latestLedger: number;
};

export type TransferSource = {
  transfers(contractId: string, from: string, to: string, ledgers: LedgerRange): Promise<TransferSearchResult>;
};

export class PaymentSearch {
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

  async missing(contractId: string, expected: SignedTransfer | null, expiryLedger: number): Promise<boolean> {
    const { transfers, latestLedger } = await this.source.transfers(
      contractId,
      this.from,
      this.to,
      PaymentSearch.ledgers(expiryLedger),
    );
    return landingClosed(latestLedger, expiryLedger) && !transferLanded(transfers, expected);
  }
}
