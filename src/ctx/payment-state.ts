export type PaymentState =
  | { kind: 'ready' }
  | { kind: 'movingSavings' }
  | { kind: 'sending' }
  | { kind: 'confirming'; txId?: string; expiryLedger?: number }
  | { kind: 'failed' }
  | { kind: 'priceExpired' }
  | { kind: 'notSent'; detail: string };

type GiftCardPayment = {
  status: string;
  paymentCryptoTxId?: string;
};

type PayRejection = {
  status: number;
  errorName?: string;
  message?: string;
  txId?: string;
};

const paymentClosedMessage = 'payment is no longer open';

export const rateLimitedMessage = 'Too many requests. Wait a few minutes and try again.';

type SentRecord = {
  expiryLedger: number;
  txId?: string;
};

type ChainTransaction = {
  status: string;
  latestLedger: number;
};

export const landingGraceLedgers = 12;

export function resumedPaymentState(giftCard: GiftCardPayment, sent?: SentRecord | null): PaymentState {
  if (giftCard.status !== 'unpaid') {
    return { kind: 'ready' };
  }
  if (giftCard.paymentCryptoTxId) {
    return { kind: 'confirming', txId: giftCard.paymentCryptoTxId };
  }
  if (sent) {
    return { kind: 'confirming', txId: sent.txId, expiryLedger: sent.expiryLedger };
  }
  return { kind: 'ready' };
}

export function sentTransactionOutcome(
  transaction: ChainTransaction,
  expiryLedger?: number,
): 'pending' | 'success' | 'failed' {
  if (
    transaction.status === 'NOT_FOUND' &&
    expiryLedger !== undefined &&
    transaction.latestLedger > expiryLedger + landingGraceLedgers
  ) {
    return 'failed';
  }
  return chainOutcome(transaction.status);
}

export function rejectedPaymentState(rejection: PayRejection): PaymentState | null {
  if (rejection.status === 409 && rejection.errorName === 'ErrPaymentAlreadySubmitted') {
    return { kind: 'confirming', txId: rejection.txId };
  }
  if (rejection.status === 429) {
    return { kind: 'notSent', detail: rateLimitedMessage };
  }
  if (rejection.status !== 400) {
    return null;
  }
  if (rejection.message === paymentClosedMessage) {
    return { kind: 'priceExpired' };
  }
  return { kind: 'notSent', detail: rejection.message ?? '' };
}

export function sendFailureState(sent: boolean, rejection?: PayRejection): PaymentState | null {
  const rejected = rejection ? rejectedPaymentState(rejection) : null;
  if (rejected) {
    return rejected;
  }
  return sent ? { kind: 'confirming' } : null;
}

export function chainOutcome(status: string): 'pending' | 'success' | 'failed' {
  if (status === 'SUCCESS') {
    return 'success';
  }
  if (status === 'FAILED') {
    return 'failed';
  }
  return 'pending';
}

export function canPay(giftCard: GiftCardPayment, state: PaymentState): boolean {
  return (
    giftCard.status === 'unpaid' &&
    !giftCard.paymentCryptoTxId &&
    (state.kind === 'ready' || state.kind === 'notSent')
  );
}

export function needsNewPrice(giftCard: GiftCardPayment, state: PaymentState): boolean {
  if (giftCard.status === 'expired') {
    return true;
  }
  return giftCard.status === 'unpaid' && (state.kind === 'failed' || state.kind === 'priceExpired');
}
