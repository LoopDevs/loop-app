import { ContentPage } from '@/components/content-page';
import { loopLinks } from '@/constants/loop-links';

export default function AccessibilityScreen() {
  return (
    <ContentPage
      title="Accessibility"
      updated="26 October 2026"
      draft
      lead="We want everyone to be able to use Loop, whatever their device, ability or situation."
      sections={[
        {
          heading: 'What we aim for',
          blocks: [
            'We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA across the Loop app and website. That means you should be able to:',
            {
              list: [
                'Use Loop with a screen reader such as VoiceOver or TalkBack.',
                'Make text larger without losing content.',
                'Move around the website with a keyboard alone.',
                'Read text with enough contrast against its background.',
              ],
            },
          ],
        },
        {
          heading: 'Known issues',
          blocks: [
            'Some gift card images and brand terms come from the brands themselves and may not always meet these standards. We are working with brands to improve them.',
          ],
        },
        {
          heading: 'Tell us about a problem',
          blocks: [
            "If something in Loop is hard to use, let us know what you were trying to do and what device you use. We'll reply within five working days.",
            { email: loopLinks.supportEmail },
          ],
        },
      ]}
    />
  );
}
