import { ContentPage } from '@/components/content-page';
import { loopLinks } from '@/constants/loop-links';

export default function CookiesScreen() {
  return (
    <ContentPage
      title="Cookie policy"
      updated="26 October 2026"
      draft
      lead="This page explains what the Loop website stores in your browser and why. Loop doesn’t use cookies for analytics or advertising."
      sections={[
        {
          heading: 'Storage we need',
          blocks: [
            'These keep the site working and can’t be switched off:',
            {
              list: [
                'Keeping you signed in as you move between pages.',
                'Remembering the country you shop in and your favourites.',
                'Keeping the key that approves your payments on this browser.',
              ],
            },
          ],
        },
        {
          heading: 'Analytics and crash reports',
          blocks: [
            'We don’t use analytics, so there is no cookie banner to answer. If the site hits an error, a crash report may be sent to our error-reporting provider so we can fix it.',
          ],
        },
        {
          heading: 'Advertising cookies',
          blocks: ['We don’t use advertising cookies, and we don’t let advertisers track you on Loop.'],
        },
        {
          heading: 'Managing stored data',
          blocks: [
            'You can clear this storage in your browser settings. If you do, you will be signed out and parts of the site may stop working.',
            'The Loop app on your phone keeps similar information on your device for the same reasons.',
          ],
        },
        {
          heading: 'Contact',
          blocks: ['Questions about cookies? Email us.', { email: loopLinks.supportEmail }],
        },
      ]}
    />
  );
}
