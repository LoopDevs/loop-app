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
