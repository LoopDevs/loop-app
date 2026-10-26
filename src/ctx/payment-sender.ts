import { resumedPaymentState, sendFailureState, type PaymentState, type PayRejection } from './payment-state.ts';
import type { SentPayments } from './sent-payments.ts';

export type SignedPayment = {
  expiryLedger: number;
  sponsor(): Promise<{ hash: string; error?: string }>;
};

type PaymentRecords = Pick<SentPayments, 'get' | 'sending' | 'sent' | 'forget'>;

export class PaymentSender {
  private readonly records: PaymentRecords;
  private readonly rejectionOf: (error: unknown) => PayRejection | undefined;

  constructor(records: PaymentRecords, rejectionOf: (error: unknown) => PayRejection | undefined) {
    this.records = records;
    this.rejectionOf = rejectionOf;
  }

  async recorded(paymentId: string): Promise<PaymentState | null> {
    const record = await this.records.get(paymentId);
    return record ? resumedPaymentState({ status: 'unpaid' }, record) : null;
  }

  async send(paymentId: string, sign: () => Promise<SignedPayment>): Promise<PaymentState> {
    const recorded = await this.recorded(paymentId);
    if (recorded) {
      return recorded;
    }
    let sent = false;
    let expiryLedger: number | undefined;
    try {
      const signed = await sign();
      expiryLedger = signed.expiryLedger;
      await this.records.sending(paymentId, signed.expiryLedger);
      sent = true;
      const result = await signed.sponsor();
      await this.records.sent(paymentId, result.hash);
      return result.error ? { kind: 'failed' } : { kind: 'confirming', txId: result.hash, expiryLedger };
    } catch (error) {
      const state = sendFailureState(sent, this.rejectionOf(error));
      if (state?.kind === 'notSent' || state?.kind === 'priceExpired') {
        await this.records.forget(paymentId);
      }
      if (state?.kind === 'confirming') {
        return { ...state, expiryLedger };
      }
      if (state) {
        return state;
      }
      throw error;
    }
  }
}
