import * as Linking from 'expo-linking';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { support } from '@/constants/support';
import type { GiftCard } from '@/ctx/client';
import { orderHelp } from '@/ctx/order-help';

export function OrderHelp({ giftCard }: { giftCard: GiftCard }) {
  const [mailUnavailable, setMailUnavailable] = useState(false);

  const openMail = async () => {
    try {
      await Linking.openURL(orderHelp.mailto(giftCard));
    } catch {
      setMailUnavailable(true);
    }
  };

  return (
    <View>
      <Button label="Get help with this order" onPress={openMail} />
      {mailUnavailable && (
        <ThemedText type="small" selectable>
          Email {support.email} and quote order {giftCard.id}.
        </ThemedText>
      )}
    </View>
  );
}
