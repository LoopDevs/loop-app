import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { GiftCardDetails } from '@/components/gift-card-details';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { ctx, type GiftCard } from '@/ctx/client';
import { giftCardStatusLabel } from '@/ctx/gift-card-status';

export default function GiftCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [giftCard, setGiftCard] = useState<GiftCard | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    ctx.giftCard(id).then(setGiftCard, (error) =>
      setMessage(error instanceof Error ? error.message : String(error)),
    );
  }, [id]);

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {!giftCard && <ThemedText type="small">{message || 'Loading…'}</ThemedText>}
        {giftCard && (
          <>
            <ThemedText type="smallBold">
              {giftCard.cardFiatAmount} {giftCard.cardFiatCurrency} {giftCard.merchantName}
            </ThemedText>
            <ThemedText type="small">{giftCardStatusLabel(giftCard.status)}</ThemedText>
            {giftCard.paymentCryptoAmount && (
              <ThemedText type="small">
                Paid: {giftCard.paymentCryptoAmount} {giftCard.paymentCryptoCurrency}
              </ThemedText>
            )}
            <GiftCardDetails giftCard={giftCard} />
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.three,
  },
});
