import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/form';
import { ThemedText } from '@/components/ui/themed-text';
import { loopLinks } from '@/constants/loop-links';
import { Spacing } from '@/constants/theme';
import type { GiftCard } from '@/ctx/client';
import { orderHelp } from '@/ctx/order-help';

export function OrderHelp({ giftCard, sentTxId }: { giftCard: GiftCard; sentTxId?: string }) {
  const [mailUnavailable, setMailUnavailable] = useState(false);

  const openMail = async () => {
    try {
      await Linking.openURL(orderHelp.mailto(giftCard, sentTxId));
    } catch {
      setMailUnavailable(true);
    }
  };

  return (
    <View style={styles.section}>
      <Button label="Get help with this order" variant="quiet" onPress={openMail} />
      {(mailUnavailable || Platform.OS === 'web') && (
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
