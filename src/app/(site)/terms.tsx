import { ContentPage } from '@/components/content-page';
import { loopLinks } from '@/constants/loop-links';

export default function TermsScreen() {
  return (
    <ContentPage
      title="Terms and conditions"
      updated="26 October 2026"
      draft
      lead="These terms explain how Loop works and what you and we agree to when you use it. Please read them before you buy a gift card."
      sections={[
        {
          heading: '1. Who we are',
          blocks: [
            'Loop ("we", "us") runs the Loop app and website. We sell digital gift cards issued by third-party brands and pay cashback on eligible purchases. Loop is available in the United States, the United Kingdom, Canada and Europe.',
          ],
        },
        {
          heading: '2. Your account',
          blocks: [
            {
              list: [
                'You must be at least 18 and live in a country where Loop is available.',
                'You may have one Loop account, and the details you give us must be accurate.',
                'Keep your phone and sign-in codes secure. You are responsible for activity on your account unless it was caused by our mistake or you told us your account was at risk.',
              ],
            },
          ],
        },
        {
          heading: '3. Buying gift cards',
          blocks: [
            'When you buy a gift card, you see the price, the currency and your cashback before you confirm. Your order is accepted once payment completes.',
            'Gift cards are issued by the brand named on the card, not by Loop. Each card is subject to that brand’s own terms, including where it can be used and any expiry date. We show these terms with each card where the brand provides them.',
          ],
        },
        {
          heading: '4. Delivery',
          blocks: [
            "Most gift cards are delivered to the Wallet tab within a few minutes. Sometimes a brand takes longer to issue a card. If we can't deliver a gift card, we refund what you paid.",
          ],
        },
        {
          heading: '5. Cashback',
          blocks: [
            {
              list: [
                'Cashback is shown before you pay and added to your balance once your gift card is delivered.',
                'Your balance is your money. You can spend it on gift cards, move it into Savings or withdraw it to your bank account.',
                'Cashback rates can change at any time, but a change never affects a purchase you have already made.',
                'If an order is refunded or reversed, the cashback from that order is removed from your balance.',
              ],
            },
          ],
        },
        {
          heading: '6. Refunds and cancellations',
          blocks: [
            "Because gift cards can be used as soon as they are delivered, you can't cancel or return a gift card once it has been delivered, except where the law gives you that right. If a card is faulty, doesn't work or was never delivered, contact support and we will put it right, usually with a refund or a replacement.",
            'Nothing in these terms affects your statutory rights as a consumer where you live.',
          ],
        },
        {
          heading: '7. Savings',
          blocks: [
            'If you move money into Savings, the rate shown in the app is variable and can go up or down. Past returns are not a guide to future returns. You can move money out of Savings at any time.',
          ],
        },
        {
          heading: '8. Fair use',
          blocks: [
            'Please don’t misuse Loop. We may limit, pause or close an account and hold back cashback if we reasonably suspect fraud, abuse, reselling of gift cards in breach of a brand’s terms, or a breach of these terms. We will tell you why where the law allows.',
          ],
        },
        {
          heading: '9. Closing your account',
          blocks: [
            'You can close your account at any time from Settings or by contacting support. Spend, save or withdraw your balance first. We may close your account with notice, or straight away if required by law or in a case of fraud.',
          ],
        },
        {
          heading: '10. Our responsibility to you',
          blocks: [
            'We are responsible for loss you suffer that is a foreseeable result of us breaking these terms or failing to use reasonable care. We are not responsible for a brand refusing a gift card in line with its own terms, or for loss we could not reasonably have foreseen.',
          ],
        },
        {
          heading: '11. Changes to these terms',
          blocks: [
            'We may update these terms. If a change affects you materially, we will tell you in the app or by email before it takes effect.',
          ],
        },
        {
          heading: '12. Contact',
          blocks: ['Questions about these terms? Email us.', { email: loopLinks.supportEmail }],
        },
      ]}
    />
  );
}
