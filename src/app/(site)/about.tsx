import { ContentPage } from '@/components/content-page';
import { loopLinks } from '@/constants/loop-links';

export default function AboutScreen() {
  return (
    <ContentPage
      title="About Loop"
      lead="Loop gives you money back on the things you already buy. Pick a brand, buy a gift card, and get cashback you can spend or save."
      sections={[
        {
          heading: 'What we do',
          blocks: [
            'Loop sells digital gift cards from hundreds of shops, restaurants and services. Every card you buy through Loop earns cashback, shown up front before you pay.',
            'Your cashback lands in your Loop balance. Use it towards your next gift card, or move it into Savings and let it grow.',
          ],
        },
        {
          heading: 'Where we operate',
          blocks: [
            'Loop is available in the United States, the United Kingdom, Canada and across Europe. You see the brands and prices for the country you pick, in your local currency.',
          ],
        },
        {
          heading: 'What we believe',
          blocks: [
            {
              list: [
                'Rewards should be simple. No points to decode, no expiry dates on your cashback.',
                'Prices should be clear. You see what you pay and what you get back before you buy.',
                'Your money is yours. Spend it, save it or ask us for help with it at any time.',
              ],
            },
          ],
        },
        {
          heading: 'Get in touch',
          blocks: ['Questions, ideas or feedback? We read every message.', { email: loopLinks.supportEmail }],
        },
      ]}
    />
  );
}
