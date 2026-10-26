import type { GiftCard } from '@/ctx/client';

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
