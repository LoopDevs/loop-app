import * as Linking from 'expo-linking';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { loopLinks } from '@/constants/loop-links';
import { Spacing } from '@/constants/theme';
import type { GiftCard } from '@/ctx/client';
import { orderHelp } from '@/ctx/order-help';
import { useSentPayment } from '@/hooks/use-sent-payment';

export function OrderHelp({ giftCard }: { giftCard: GiftCard }) {
  const [mailUnavailable, setMailUnavailable] = useState(false);
  const sent = useSentPayment(giftCard.paymentId);

  const openMail = async () => {
    try {
      await Linking.openURL(orderHelp.mailto(giftCard, sent?.txId));
    } catch {
      setMailUnavailable(true);
    }
  };

  return (
    <View style={styles.section}>
      <Button label="Get help with this order" variant="quiet" onPress={openMail} />
      {mailUnavailable && (
        <ThemedText type="small" themeColor="textSecondary" selectable accessibilityLiveRegion="polite">
          Email {loopLinks.supportEmail} and quote order {giftCard.id}.
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
});
