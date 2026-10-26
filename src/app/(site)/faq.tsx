import { ContentPage } from '@/components/content-page';
import { loopLinks } from '@/constants/loop-links';

export default function FaqScreen() {
  return (
    <ContentPage
      title="Frequently asked questions"
      lead="Quick answers about buying gift cards, getting cashback and managing your account."
      sections={[
        {
          heading: 'Buying gift cards',
          blocks: [
            {
              questions: [
                {
                  question: 'How do I buy a gift card?',
                  answer:
                    'Find a brand, choose an amount and pay. You see the price and your cashback before you confirm.',
                },
                {
                  question: 'How long does delivery take?',
                  answer:
                    "Most gift cards arrive in the app within a few minutes. Some brands take longer to issue a card. If yours hasn't arrived within an hour, contact support.",
                },
                {
                  question: 'Where do I find my gift card?',
                  answer:
                    'Your gift cards are in the Wallet tab. Open one to see its code, PIN and how to use it with that brand.',
                },
                {
                  question: 'Can I use a gift card in store?',
                  answer:
                    "Many brands accept their gift cards both online and in store. Each card shows where it can be used.",
                },
              ],
            },
          ],
        },
        {
          heading: 'Cashback',
          blocks: [
            {
              questions: [
                {
                  question: 'How much cashback do I get?',
                  answer:
                    "Each brand shows its cashback rate. The exact amount you'll get back is shown before you pay.",
                },
                {
                  question: 'When do I get my cashback?',
                  answer: 'Cashback is added to your balance once your gift card is delivered.',
                },
                {
                  question: 'What can I do with my cashback?',
                  answer:
                    "It's your money. Spend it on your next gift card, move it into Savings, or withdraw it to your bank account.",
                },
                {
                  question: 'Does my cashback expire?',
                  answer: 'No. Your cashback stays in your balance until you use it.',
                },
              ],
            },
          ],
        },
        {
          heading: 'Refunds and problems',
          blocks: [
            {
              questions: [
                {
                  question: "My gift card didn't arrive. What now?",
                  answer:
                    "If a gift card can't be delivered, we refund what you paid. Contact support if a card is late and we'll look into it.",
                },
                {
                  question: 'Can I return a gift card?',
                  answer:
                    "Once a gift card has been delivered it can't usually be returned, because it can be used straight away. If something's wrong with a card, contact support and we'll help.",
                },
                {
                  question: "A brand won't accept my gift card.",
                  answer:
                    "Check the card's terms for where it can be used. If it still won't work, contact support with the order details.",
                },
              ],
            },
          ],
        },
        {
          heading: 'Your account',
          blocks: [
            {
              questions: [
                {
                  question: 'Which countries is Loop available in?',
                  answer: 'Loop is available in the United States, the United Kingdom, Canada and Europe.',
                },
                {
                  question: 'How do I close my account?',
                  answer:
                    "Go to Profile, then Settings, and request account deletion, or email support. Spend, save or withdraw your balance first. We'll confirm once your account is closed.",
                },
                {
                  question: 'How do I get help?',
                  answer: `Email ${loopLinks.supportEmail} and a person will get back to you.`,
                },
              ],
            },
          ],
        },
      ]}
    />
  );
}
