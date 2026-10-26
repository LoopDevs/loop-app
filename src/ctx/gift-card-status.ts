import type { GiftCard } from '@/ctx/client';

export type CashbackState = 'none' | 'pending' | 'credited' | 'reversed';

export const pollIntervalMs = 3000;
export const settledStatuses: GiftCard['status'][] = ['fulfilled', 'rejected', 'refunded', 'expired'];
export const historyHiddenStatuses: GiftCard['status'][] = ['unpaid', 'expired'];

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

export function outcomeText(card: GiftCard): string | null {
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
  if (status === 'expired' && (paymentCryptoTxId || paymentMethod !== 'crypto')) {
    return `This order expired. If you were charged, ${refundAdvice}`;
  }
  if (paymentStatus === 'cancelled') {
    return `This order was cancelled. If you were charged, ${refundAdvice}`;
  }
  if (paymentStatus === 'error' || paymentStatus === 'expired') {
    return "This order didn't go through. You weren't charged.";
  }
  return null;
}

export function emailNotice(card: GiftCard): string | null {
  return card.status === 'paid' ? "We'll also email your card when it's ready." : null;
}

export function cashbackState(card: GiftCard): CashbackState {
  if (!card.cashbackAmount) {
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
      return 'on the way';
    case 'credited':
      return 'paid';
    case 'reversed':
      return 'reversed';
    case 'none':
      return '';
  }
}
