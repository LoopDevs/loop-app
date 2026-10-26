import { ContentPage } from '@/components/content-page';
import { loopLinks } from '@/constants/loop-links';

export default function CareersScreen() {
  return (
    <ContentPage
      title="Careers"
      lead="We're a small team building a simpler way to earn money back on everyday spending."
      sections={[
        {
          heading: 'How we work',
          blocks: [
            {
              list: [
                'Small team, big ownership. Everyone ships, and everyone talks to customers.',
                'Remote-friendly across the US, UK, Canada and Europe.',
                'Plain words over jargon, in the product and in how we work together.',
              ],
            },
          ],
        },
        {
          heading: 'Open roles',
          blocks: [
            "We don't have any open roles right now. If you'd like to be first to hear when that changes, send us a note about yourself and what you'd like to work on.",
            { email: loopLinks.careersEmail },
          ],
        },
      ]}
    />
  );
}
