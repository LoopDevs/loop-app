import { ContentPage } from '@/components/content-page';
import { loopLinks } from '@/constants/loop-links';

export default function CookiesScreen() {
  return (
    <ContentPage
      title="Cookie policy"
      updated="26 October 2026"
      draft
      lead="Cookies are small files a website stores in your browser. This page explains which ones Loop uses on the web and why."
      sections={[
        {
          heading: 'Cookies we need',
          blocks: [
            'These keep the site working and can’t be switched off:',
            {
              list: [
                'Keeping you signed in as you move between pages.',
                'Remembering the country you shop in.',
                'Protecting your account and spotting suspicious activity.',
              ],
            },
          ],
        },
        {
          heading: 'Cookies that help us improve',
          blocks: [
            'With your permission, we use privacy-friendly analytics to understand which pages are used and where things go wrong. This information is grouped and doesn’t identify you.',
          ],
        },
        {
          heading: 'Advertising cookies',
          blocks: ['We don’t use advertising cookies, and we don’t let advertisers track you on Loop.'],
        },
        {
          heading: 'Managing cookies',
          blocks: [
            'You can change your choice at any time, and you can block or delete cookies in your browser settings. If you block the cookies we need, parts of the site may stop working.',
            'The Loop app on your phone stores similar information on your device for the same reasons.',
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
