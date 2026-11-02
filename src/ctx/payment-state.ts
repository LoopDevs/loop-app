export type PaymentState =
  | { kind: 'ready' }
  | { kind: 'bank'; linkOpen: boolean }
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

export type PayRejection = {
  status: number;
  errorName?: string;
  message?: string;
  txId?: string;
};

const paymentClosedMessage = 'payment is no longer open';

export const rateLimitedMessage = 'Too many requests. Wait a few minutes and try again.';

export type SignedTransfer = {
  amount: bigint;
  muxedId?: bigint;
};

type SentRecord = {
  expiryLedger?: number;
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
    landingClosed(transaction.latestLedger, expiryLedger)
  ) {
    return 'failed';
  }
  return chainOutcome(transaction.status);
}

export function landingClosed(latestLedger: number, expiryLedger: number): boolean {
  return latestLedger > expiryLedger + landingGraceLedgers;
}

export function transferAmount(value: unknown): bigint | null {
  if (typeof value === 'bigint') {
    return value;
  }
  if (value && typeof value === 'object' && 'amount' in value) {
    const { amount } = value as { amount: unknown };
    return typeof amount === 'bigint' ? amount : null;
  }
  return null;
}

export function transferMuxedId(value: unknown): bigint | null {
  if (value && typeof value === 'object' && 'to_muxed_id' in value) {
    const { to_muxed_id: muxedId } = value as { to_muxed_id: unknown };
    return typeof muxedId === 'bigint' ? muxedId : null;
  }
  return null;
}

export function transferMatches(value: unknown, expected: SignedTransfer | null): boolean {
  const amount = transferAmount(value);
  if (amount === null) {
    return false;
  }
  if (!expected) {
    return true;
  }
  return (
    amount === expected.amount &&
    (expected.muxedId === undefined || transferMuxedId(value) === expected.muxedId)
  );
}

export function transferLanded(values: readonly unknown[], expected: SignedTransfer | null): boolean {
  return values.some((value) => transferMatches(value, expected));
}

export function isAlreadySubmitted(rejection: PayRejection): boolean {
  return rejection.status === 409 && rejection.errorName === 'ErrPaymentAlreadySubmitted';
}

export function rejectedPaymentState(rejection: PayRejection): PaymentState | null {
  if (isAlreadySubmitted(rejection)) {
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
