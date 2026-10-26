import { support } from '../constants/support.ts';
import { dates } from '../money.ts';
import type { GiftCard } from './client.ts';

export const orderHelp = {
  subject(giftCard: GiftCard): string {
    return `Loop order ${giftCard.id}`;
  },

  body(giftCard: GiftCard): string {
    return [
      `Merchant: ${giftCard.merchantName}`,
      `Amount: ${giftCard.cardFiatAmount} ${giftCard.cardFiatCurrency}`,
      `Status: ${giftCard.status}`,
      `Date: ${dates.day(giftCard.created, 'en')}`,
      `Order id: ${giftCard.id}`,
      '',
      'What went wrong:',
      '',
    ].join('\n');
  },

  mailto(giftCard: GiftCard): string {
    const subject = encodeURIComponent(orderHelp.subject(giftCard));
    const body = encodeURIComponent(orderHelp.body(giftCard));
    return `mailto:${support.email}?subject=${subject}&body=${body}`;
  },
};
