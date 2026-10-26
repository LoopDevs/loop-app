import { ContentPage } from '@/components/content-page';
import { loopLinks } from '@/constants/loop-links';

export default function PressScreen() {
  return (
    <ContentPage
      title="Press"
      lead="News, background and brand assets for journalists and creators writing about Loop."
      sections={[
        {
          heading: 'About Loop',
          blocks: [
            'Loop is a cashback app for everyday spending. Shoppers buy digital gift cards from hundreds of brands and earn cashback on every purchase, which they can spend on their next card or move into Savings. Loop is available in the United States, the United Kingdom, Canada and Europe.',
          ],
        },
        {
          heading: 'Press contact',
          blocks: ['For interviews, comment or data requests, email our press team.', { email: loopLinks.pressEmail }],
        },
        {
          heading: 'Brand assets',
          blocks: [
            'Our logo, product screenshots and team photos are available on request from the press team. Please use the Loop name and logo as supplied and avoid changing their colours or proportions.',
          ],
        },
      ]}
    />
  );
}
