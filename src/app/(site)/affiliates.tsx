import { ContentPage } from '@/components/content-page';
import { loopLinks } from '@/constants/loop-links';

export default function AffiliatesScreen() {
  return (
    <ContentPage
      title="Affiliates and partners"
      lead="Loop has no referral or affiliate programme yet. If you'd like to work with us, get in touch."
      sections={[
        {
          heading: 'For creators and publishers',
          blocks: [
            'We don’t pay commission or offer referral links yet. If you have an audience that would like Loop, tell us about it below.',
          ],
        },
        {
          heading: 'For brands',
          blocks: [
            'Put your gift cards in front of shoppers who are ready to buy. We handle checkout, delivery and customer support, and you reach new customers in the US, UK, Canada and Europe.',
          ],
        },
        {
          heading: 'Apply',
          blocks: [
            "Tell us who you are, where your audience or customers are, and how you'd like to work together. We'll get back to you within a few working days.",
            { email: loopLinks.partnersEmail },
          ],
        },
      ]}
    />
  );
}
