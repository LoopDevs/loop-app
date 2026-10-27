import type { GiftCard } from '../ctx/client.ts';
import { needsPaymentSearch } from '../ctx/gift-card-status.ts';
import { landingClosed, transferLanded, transferMatches, type SignedTransfer } from '../ctx/payment-state.ts';
import { network } from '../stellar/network.ts';
import type { LedgerRange, TransferSearchResult } from '../stellar/transfer-events.ts';
import { units } from '../stellar/units.ts';
import { SponsoredCall } from './sponsored-call.ts';

export type LedgerRetention = {
  oldestLedger: number;
  latestLedger: number;
};

export type TransferSource = {
  transfers(contractId: string, from: string, to: string, ledgers: LedgerRange): Promise<TransferSearchResult>;
  retention(): Promise<LedgerRetention>;
};

export type TimeSpan = {
  from: number;
  to: number;
};

export type LedgerSearch = {
  ledgers: LedgerRange;
  complete: boolean;
};

export type OrderTransfer = {
  contract: string;
  expected: SignedTransfer;
  span: TimeSpan;
};

export type OrderPayment = { kind: 'sent'; txId?: string } | { kind: 'notSent' } | { kind: 'unknown' };

export type OrderPayer = {
  orderPaid(giftCard: GiftCard): Promise<OrderPayment>;
};

export type SentPaymentRecords = {
  get(paymentId: string): Promise<{ txId?: string } | null>;
};

export class PaymentSearch {
  static readonly fastestLedgerMs = 4_000;
  static readonly slowestLedgerMs = 7_000;
  static readonly retentionMarginLedgers = 60;
  static readonly clockSkewMs = 60_000;

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

  static ledgersDuring(retention: LedgerRetention, span: TimeSpan, now: number): LedgerSearch | null {
    const { oldestLedger, latestLedger } = retention;
    const searchableLedger = oldestLedger + PaymentSearch.retentionMarginLedgers;
    const ledgersBack = Math.ceil((now - span.from) / PaymentSearch.fastestLedgerMs);
    const ledgersAfter = Math.floor((now - span.to) / PaymentSearch.slowestLedgerMs);
    const neededStart = latestLedger - ledgersBack - SponsoredCall.maxExpiryLedgers;
    const startLedger = Math.max(searchableLedger, neededStart);
    const endLedger = Math.min(latestLedger, latestLedger - ledgersAfter + SponsoredCall.maxExpiryLedgers) + 1;
    if (!(startLedger < endLedger)) {
      return null;
    }
    return {
      ledgers: { startLedger, endLedger },
      complete: neededStart >= searchableLedger,
    };
  }

  static landedWithin(closedAt: number, span: TimeSpan): boolean {
    const lastLanding = span.to + SponsoredCall.maxExpiryLedgers * PaymentSearch.slowestLedgerMs;
    return closedAt >= span.from - PaymentSearch.clockSkewMs && closedAt <= lastLanding + PaymentSearch.clockSkewMs;
  }

  static orderTransfer(giftCard: GiftCard): OrderTransfer | null {
    const { paymentCryptoAmount, paymentCryptoAddress, paymentUrlExpiration } = giftCard;
    const token = network.tokens.find((candidate) => candidate.currency === giftCard.paymentCryptoCurrency);
    if (!token || !paymentCryptoAmount || !paymentCryptoAddress || !paymentUrlExpiration) {
      return null;
    }
    const muxedId = SponsoredCall.muxedIdOf(paymentCryptoAddress);
    const amount = units.parse(paymentCryptoAmount);
    return {
      contract: token.contract,
      expected: muxedId === undefined ? { amount } : { amount, muxedId },
      span: {
        from: Date.parse(giftCard.created),
        to: Date.parse(paymentUrlExpiration),
      },
    };
  }

  async missing(contractId: string, expected: SignedTransfer | null, expiryLedger: number): Promise<boolean> {
    const { transfers, latestLedger } = await this.source.transfers(
      contractId,
      this.from,
      this.to,
      PaymentSearch.ledgers(expiryLedger),
    );
    return (
      landingClosed(latestLedger, expiryLedger) &&
      !transferLanded(
        transfers.map((transfer) => transfer.value),
        expected,
      )
    );
  }

  async orderPaid(giftCard: GiftCard, now: number): Promise<OrderPayment> {
    const order = PaymentSearch.orderTransfer(giftCard);
    if (!order) {
      return { kind: 'notSent' };
    }
    const search = PaymentSearch.ledgersDuring(await this.source.retention(), order.span, now);
    if (!search) {
      return { kind: 'unknown' };
    }
    const { transfers, latestLedger } = await this.source.transfers(order.contract, this.from, this.to, search.ledgers);
    const payment = transfers.find(
      (transfer) =>
        PaymentSearch.landedWithin(transfer.closedAt, order.span) && transferMatches(transfer.value, order.expected),
    );
    if (payment) {
      return { kind: 'sent', txId: payment.txHash };
    }
    const searched = search.complete && latestLedger >= search.ledgers.endLedger - 1;
    return searched ? { kind: 'notSent' } : { kind: 'unknown' };
  }
}

export class PaymentCheck {
  private readonly sentPayments: SentPaymentRecords;
  private readonly loadPayer: () => Promise<OrderPayer | null>;
  private payer: Promise<OrderPayer | null> | null = null;

  constructor(sentPayments: SentPaymentRecords, loadPayer: () => Promise<OrderPayer | null>) {
    this.sentPayments = sentPayments;
    this.loadPayer = loadPayer;
  }

  async sent(giftCard: GiftCard): Promise<OrderPayment> {
    const record = await this.sentPayments.get(giftCard.paymentId).catch(() => null);
    if (record) {
      return { kind: 'sent', txId: record.txId };
    }
    if (!needsPaymentSearch(giftCard)) {
      return { kind: 'unknown' };
    }
    try {
      this.payer ??= this.loadPayer();
      const payer = await this.payer;
      return payer ? await payer.orderPaid(giftCard) : { kind: 'notSent' };
    } catch (error) {
      console.warn('Searching the wallet for the order payment failed', error);
      return { kind: 'unknown' };
    }
  }
}
