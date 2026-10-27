import type { GiftCard } from '@/ctx/client';

export type CashbackState = 'none' | 'pending' | 'credited' | 'reversed';

export const pollIntervalMs = 3000;
const maxPollIntervalMs = 30000;

export function pollDelayMs(polls: number): number {
  return Math.min(maxPollIntervalMs, pollIntervalMs * 2 ** Math.floor(polls / 10));
}
export const settledStatuses: GiftCard['status'][] = ['fulfilled', 'rejected', 'refunded', 'expired'];
export const unpaidStatuses: GiftCard['status'][] = ['unpaid'];

export function wasCharged(card: GiftCard): boolean {
  return card.paymentStatus === 'paid' || Boolean(card.paymentCryptoTxId) || card.paymentMethod !== 'crypto';
}

export function isHiddenFromHistory(card: GiftCard, sentFromDevice = false): boolean {
  if (card.status === 'unpaid') {
    return true;
  }
  return card.status === 'expired' && !wasCharged(card) && !sentFromDevice;
}

export function giftCardStatusLabel(status: GiftCard['status']): string {
  switch (status) {
    case 'unpaid':
      return 'Waiting for payment';
    case 'paid':
      return 'Processing';
    case 'fulfilled':
      return 'Ready';
    case 'rejected':
      return 'Failed';
    case 'refunded':
      return 'Refunded';
    case 'expired':
      return 'Expired';
    default: {
      const unknown: never = status;
      return unknown;
    }
  }
}

const refundAdvice = 'contact support about a refund.';

export function outcomeText(card: GiftCard, sentUnconfirmed = false): string | null {
  const { status, paymentStatus, paymentMethod, paymentCryptoTxId } = card;
  if (status === 'refunded') {
    return 'Your payment was refunded.';
  }
  if (status === 'rejected' && paymentStatus === 'paid') {
    return `This card couldn't be issued. Contact support about a refund.`;
  }
  if (status === 'rejected' && paymentCryptoTxId) {
    return `This card couldn't be issued. If you were charged, ${refundAdvice}`;
  }
  if (status === 'expired' && paymentStatus === 'paid') {
    return `This order expired after payment. Contact support about a refund.`;
  }
  if (status === 'expired' && (paymentCryptoTxId || paymentMethod !== 'crypto' || sentUnconfirmed)) {
    return `This order expired. If you were charged, ${refundAdvice}`;
  }
  if (paymentStatus === 'cancelled') {
    return `This order was cancelled. If you were charged, ${refundAdvice}`;
  }
  if (paymentStatus === 'error' || paymentStatus === 'expired') {
    return "This order didn't go through. You weren't charged.";
  }
  if (status === 'paid') {
    return "We'll also email your card when it's ready.";
  }
  return null;
}

export function cashbackState(
  card: Pick<GiftCard, 'status' | 'cashbackAmount' | 'cashbackCredited' | 'cashbackReversed'>,
): CashbackState {
  if (!card.cashbackAmount || !(Number(card.cashbackAmount) > 0)) {
    return 'none';
  }
  if (card.cashbackReversed) {
    return 'reversed';
  }
  if (card.cashbackCredited) {
    return 'credited';
  }
  return card.status === 'paid' || card.status === 'fulfilled' ? 'pending' : 'none';
}

export function cashbackStateLabel(state: CashbackState): string {
  switch (state) {
    case 'pending':
      return 'pending';
    case 'credited':
      return 'on the way';
    case 'reversed':
      return 'reversed';
    case 'none':
      return '';
  }
}
