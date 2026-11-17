import { ContentPage } from '@/components/content-page';
import { loopLinks } from '@/constants/loop-links';

export default function PrivacyScreen() {
  return (
    <ContentPage
      title="Privacy policy"
      updated="26 October 2026"
      draft
      lead="This policy explains what personal information Loop collects, why we use it, who we share it with and the choices you have."
      sections={[
        {
          heading: 'What we collect',
          blocks: [
            {
              list: [
                'Account details: your email address, name if you give it, and the country you shop in.',
                'Purchase details: the gift cards you buy, amounts, dates and the cashback you earn.',
                'Balance and Savings activity: money added, spent, saved or withdrawn.',
                'Wallet activity: payments and Savings moves are recorded on a public payment network (Stellar). Anyone can see that record, and it is permanent.',
                'Bank payment details: if you pay from your bank, they come to us through Plaid, our bank connection provider.',
                'Device details: app version, device type and crash reports.',
                'Messages you send to our support team.',
              ],
            },
          ],
        },
        {
          heading: 'How we use it',
          blocks: [
            {
              list: [
                'To run your account, deliver your gift cards and pay your cashback.',
                'To keep Loop secure and prevent fraud.',
                'To answer your questions and fix problems.',
                'To find and fix problems, using crash reports.',
                'To meet our legal obligations, such as tax and financial record keeping.',
                'To send you offers, only if you agree. You can opt out at any time.',
              ],
            },
          ],
        },
        {
          heading: 'Who we share it with',
          blocks: [
            'We never sell your personal information. We share it only with:',
            {
              list: [
                'Gift card providers and brands, so they can issue your card.',
                'Payment and banking partners, including Plaid for bank payments, so you can pay, save and withdraw.',
                'The public payment network (Stellar), where wallet activity is recorded and visible to anyone.',
                'Service providers who host our systems, report crashes or help with support, under contracts that protect your data.',
                'Authorities, where the law requires it.',
              ],
            },
          ],
        },
        {
          heading: 'Where your data is kept',
          blocks: [
            'Some of our service providers are outside your country. Where we move data outside the UK, the EU or Canada, we use legal safeguards such as standard contractual clauses.',
          ],
        },
        {
          heading: 'How long we keep it',
          blocks: [
            'We keep your information while your account is open. After you close it, we keep purchase and payment records for as long as the law requires, usually up to seven years, and delete or anonymise the rest. Wallet activity on the public payment network (Stellar) is permanent and can’t be deleted by us or anyone else.',
          ],
        },
        {
          heading: 'Your rights',
          blocks: [
            'Depending on where you live, including under UK and EU data protection law, Canadian privacy law and US state privacy laws, you can:',
            {
              list: [
                'Ask for a copy of your information.',
                'Ask us to correct or delete it. This doesn’t reach wallet activity on the public payment network.',
                'Object to or limit how we use it, including for marketing.',
                'Ask us to send your information to another service.',
                'Complain to your local data protection authority.',
              ],
            },
            'To request a copy of your data or delete your account, email us. In Settings, Delete my account opens an email to support.',
          ],
        },
        {
          heading: 'Contact',
          blocks: ['Questions about your privacy? Email us.', { email: loopLinks.supportEmail }],
        },
      ]}
    />
  );
}
