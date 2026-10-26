import { ContentPage } from '@/components/content-page';
import { loopLinks } from '@/constants/loop-links';

export default function ComplaintsScreen() {
  return (
    <ContentPage
      title="Complaints"
      updated="26 October 2026"
      draft
      lead="If we've got something wrong, we want to hear about it and put it right."
      sections={[
        {
          heading: 'How to complain',
          blocks: [
            'Email us with "Complaint" in the subject line. Tell us what happened, when, and what you would like us to do. Include your account email and any order details.',
            { email: loopLinks.supportEmail },
          ],
        },
        {
          heading: 'What happens next',
          blocks: [
            {
              list: [
                "We'll confirm we've received your complaint within two working days.",
                'Someone who was not involved in the original issue will look into it.',
                "We'll send you our final answer within eight weeks, and usually much sooner. If we need longer, we'll explain why.",
              ],
            },
          ],
        },
        {
          heading: "If you're not happy with our answer",
          blocks: [
            'You may be able to take your complaint to a consumer protection body or dispute resolution service where you live. Our final answer will tell you which one applies and how to contact them.',
          ],
        },
      ]}
    />
  );
}
