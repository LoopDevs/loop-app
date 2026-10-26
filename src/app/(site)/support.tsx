import { ContentPage } from '@/components/content-page';
import { loopLinks } from '@/constants/loop-links';

export default function SupportScreen() {
  return (
    <ContentPage
      title="Support"
      lead="Need a hand? A real person reads every message."
      sections={[
        {
          heading: 'Contact us',
          blocks: [
            'Email us and we aim to reply within one working day.',
            { email: loopLinks.supportEmail },
          ],
        },
        {
          heading: 'Help us help you faster',
          blocks: [
            'Include as much of this as you can:',
            {
              list: [
                'The email address on your Loop account.',
                'The brand and amount of the gift card, and roughly when you bought it.',
                "What happened, and what you expected to happen.",
                'A screenshot, if something looks wrong in the app.',
              ],
            },
          ],
        },
        {
          heading: 'Before you write',
          blocks: [
            'The FAQ answers the most common questions about delivery, cashback, refunds and closing your account.',
            "We will never ask for your sign-in code, PIN or gift card codes by email, phone or message. If someone does, don't share them and let us know.",
          ],
        },
      ]}
    />
  );
}
