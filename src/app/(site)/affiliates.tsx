import { ContentPage } from '@/components/content-page';
import { loopLinks } from '@/constants/loop-links';

export default function AffiliatesScreen() {
  return (
    <ContentPage
      title="Affiliates and partners"
      lead="Earn with Loop by sending shoppers or brands our way."
      sections={[
        {
          heading: 'For creators and publishers',
          blocks: [
            'Share Loop with your audience and earn a commission when the people you refer buy gift cards. You get a personal link, simple reporting and regular payouts.',
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
