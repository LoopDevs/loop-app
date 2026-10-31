import {
  isAlreadySubmitted,
  resumedPaymentState,
  sendFailureState,
  type PaymentState,
  type PayRejection,
  type SignedTransfer,
} from './payment-state.ts';
import type { SentPayments } from './sent-payments.ts';

export type SignedPayment = {
  expiryLedger: number;
  transfer: SignedTransfer;
  sponsor(): Promise<{ hash: string; error?: string }>;
};

export type PaymentLock = {
  exclusive<T>(name: string, task: () => Promise<T>): Promise<T>;
};

export type SendOutcome = {
  state: PaymentState;
  resumed: boolean;
  paidElsewhere?: boolean;
};

type PaymentRecords = Pick<SentPayments, 'get' | 'sending' | 'sent' | 'alreadySubmitted' | 'forget'>;

export class PaymentSender {
  private readonly records: PaymentRecords;
  private readonly rejectionOf: (error: unknown) => PayRejection | undefined;
  private readonly lock: PaymentLock;

  constructor(
    records: PaymentRecords,
    rejectionOf: (error: unknown) => PayRejection | undefined,
    lock: PaymentLock,
  ) {
    this.records = records;
    this.rejectionOf = rejectionOf;
    this.lock = lock;
  }

  async recorded(paymentId: string): Promise<PaymentState | null> {
    const record = await this.records.get(paymentId);
    return record ? resumedPaymentState({ status: 'unpaid' }, record) : null;
  }

  send(paymentId: string, sign: () => Promise<SignedPayment>): Promise<SendOutcome> {
    return this.lock.exclusive(`pay:${paymentId}`, async () => {
      const recorded = await this.recorded(paymentId);
      if (recorded) {
        return { state: recorded, resumed: true };
      }
      return { state: await this.signAndSponsor(paymentId, sign), resumed: false };
    });
  }

  private async signAndSponsor(paymentId: string, sign: () => Promise<SignedPayment>): Promise<PaymentState> {
    let sent = false;
    let expiryLedger: number | undefined;
    try {
      const signed = await sign();
      expiryLedger = signed.expiryLedger;
      await this.records.sending(paymentId, { expiryLedger, transfer: signed.transfer });
      sent = true;
      const result = await signed.sponsor();
      await this.records.sent(paymentId, result.hash);
      return result.error ? { kind: 'failed' } : { kind: 'confirming', txId: result.hash, expiryLedger };
    } catch (error) {
      const rejection = this.rejectionOf(error);
      if (rejection && isAlreadySubmitted(rejection)) {
        if (sent) {
          await this.records.alreadySubmitted(paymentId, rejection.txId);
        }
        return { kind: 'confirming', txId: rejection.txId };
      }
      const state = sendFailureState(sent, rejection);
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
