import { ContentPage } from '@/components/content-page';
import { loopLinks } from '@/constants/loop-links';

export default function SecurityScreen() {
  return (
    <ContentPage
      title="Security"
      lead="How we keep your account and your money safe, and what you can do too."
      sections={[
        {
          heading: 'How we protect your account',
          blocks: [
            {
              list: [
                'Signing in uses a one-time code or your Apple or Google account. There is no password to steal or reuse.',
                "Payments need your confirmation on your own device, using your phone's face, fingerprint or screen lock.",
                'You can lock the app so it asks for your face, fingerprint or screen lock each time it opens.',
                'Your details travel over encrypted connections and are stored encrypted.',
                'We watch for unusual activity and may pause an account to protect it while we check.',
              ],
            },
          ],
        },
        {
          heading: 'What you can do',
          blocks: [
            {
              list: [
                'Keep your phone up to date and protected with a screen lock.',
                'Never share your sign-in codes, PINs or gift card codes. Loop will never ask for them.',
                "If you lose your phone or think someone else has access to your account, contact support straight away.",
              ],
            },
          ],
        },
        {
          heading: 'Report a security issue',
          blocks: [
            "If you've found a security weakness in Loop, please tell us privately so we can fix it. Include steps to reproduce and any supporting details. We'll acknowledge your report within three working days and keep you updated.",
            'Please give us reasonable time to fix the issue before sharing it publicly, and avoid accessing other people’s data or disrupting the service while testing.',
            { email: loopLinks.securityEmail },
          ],
        },
      ]}
    />
  );
}
