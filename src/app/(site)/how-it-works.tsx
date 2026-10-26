import { ContentPage } from '@/components/content-page';

export default function HowItWorksScreen() {
  return (
    <ContentPage
      title="How Loop works"
      lead="Buy a gift card, get money back, then spend it or save it."
      sections={[
        {
          heading: '1. Pick a brand',
          blocks: [
            "Browse or search for a shop, restaurant or service. Each brand shows how much cashback you'll get, so you know before you buy.",
          ],
        },
        {
          heading: '2. Buy a gift card',
          blocks: [
            'Choose an amount and pay. Most gift cards arrive in the app within a few minutes, ready to use online or in store.',
          ],
        },
        {
          heading: '3. Get cashback',
          blocks: [
            'Your cashback is added to your Loop balance once your gift card is delivered. It shows in the app straight away.',
          ],
        },
        {
          heading: '4. Spend it or save it',
          blocks: [
            {
              list: [
                'Spend: put your balance towards your next gift card.',
                'Save: move it into Savings, where it can grow over time.',
                'Withdraw: take it out to your bank account when you need it.',
              ],
            },
          ],
        },
      ]}
    />
  );
}
