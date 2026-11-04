import { StyleSheet, View } from 'react-native';

import { ExternalLink } from '@/components/external-link';
import { ThemedText } from '@/components/ui/themed-text';
import { loopLinks } from '@/constants/loop-links';
import { Spacing } from '@/constants/theme';

export const purchaseTermsKey = (userId: string) => `loop.purchaseTermsAccepted.${userId}`;

const purchaseTerms = [
  "Once your gift card is delivered, you can't cancel or return it, except where the law gives you that right. If a card is faulty or never arrives, contact support and we will put it right.",
  'Cashback is credited to your Loop account once your gift card is delivered.',
  "Each gift card is subject to the brand's own terms, including where it can be used and any expiry date.",
];

export function PurchaseTerms() {
  return (
    <View style={styles.section} accessibilityLiveRegion="polite">
      <ThemedText type="subtitle" accessibilityRole="header">
        Before your first gift card
      </ThemedText>
      {purchaseTerms.map((term) => (
        <ThemedText key={term} type="small" themeColor="textSecondary">
          {term}
        </ThemedText>
      ))}
      <ThemedText type="small" themeColor="textSecondary">
        Read the full{' '}
        <ExternalLink href={loopLinks.terms} style={styles.termsLink}>
          Terms
        </ExternalLink>
        .
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  termsLink: {
    textDecorationLine: 'underline',
  },
});
