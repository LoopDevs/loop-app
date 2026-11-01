import { loopLinks } from '../constants/loop-links.ts';
import { dates } from '../money.ts';
import type { GiftCard } from './client.ts';

export const orderHelp = {
  subject(giftCard: GiftCard): string {
    return `Loop order ${giftCard.id}`;
  },

  body(giftCard: GiftCard, sentTxId?: string): string {
    const txId = giftCard.paymentCryptoTxId ?? sentTxId;
    return [
      `Merchant: ${giftCard.merchantName}`,
      `Amount: ${giftCard.cardFiatAmount} ${giftCard.cardFiatCurrency}`,
      `Status: ${giftCard.status}`,
      `Date: ${dates.day(giftCard.created, 'en')}`,
      `Order id: ${giftCard.id}`,
      ...(txId ? [`Payment transaction: ${txId}`] : []),
      '',
      'What went wrong:',
      '',
    ].join('\n');
  },

  mailto(giftCard: GiftCard, sentTxId?: string): string {
    const subject = encodeURIComponent(orderHelp.subject(giftCard));
    const body = encodeURIComponent(orderHelp.body(giftCard, sentTxId));
    return `mailto:${loopLinks.supportEmail}?subject=${subject}&body=${body}`;
  },
};
