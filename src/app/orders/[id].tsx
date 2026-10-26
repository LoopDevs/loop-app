import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/form';
import { GiftCardDetails } from '@/components/gift-card-details';
import { OrderHelp } from '@/components/order-help';
import { OrderDetailSkeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { ctx, type GiftCard } from '@/ctx/client';
import {
  cashbackState,
  cashbackStateLabel,
  giftCardStatusLabel,
  outcomeText,
  pollIntervalMs,
} from '@/ctx/gift-card-status';
import { useSessionOwner } from '@/hooks/use-session-owner';
import { money } from '@/money';

const signInMessage = 'Sign in to see this order.';

export default function GiftCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [giftCard, setGiftCard] = useState<GiftCard | null>(null);
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const readSession = useSessionOwner();

  useFocusEffect(
    useCallback(() => {
      let current = true;
      readSession()
        .then(({ userId, changed }) => {
          if (current && (changed || !userId)) {
            setGiftCard(null);
            setMessage('');
            setAttempt((count) => count + 1);
          }
        })
        .catch(() => undefined);
      return () => {
        current = false;
      };
    }, [readSession]),
  );

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const { userId, changed } = await readSession();
        if (!active) {
          return;
        }
        if (changed || !userId) {
          setGiftCard(null);
        }
        if (!userId) {
          setMessage(signInMessage);
          return;
        }
        const loaded = await ctx.giftCard(id);
        if (!active) {
          return;
        }
        setGiftCard(loaded);
        if (loaded.status === 'paid') {
          timer = setTimeout(load, pollIntervalMs);
        }
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : String(error));
        }
      }
    };
    load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id, attempt, readSession]);

  const retry = () => {
    setMessage('');
    setAttempt((count) => count + 1);
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {!giftCard && !message && <OrderDetailSkeleton />}
        {message !== '' && (
          <>
            <ThemedText type="small">{message}</ThemedText>
            <Button label="Retry" onPress={retry} />
          </>
        )}
        {giftCard && <GiftCardSummary giftCard={giftCard} />}
      </ScrollView>
    </ThemedView>
  );
}

function GiftCardSummary({ giftCard }: { giftCard: GiftCard }) {
  const cashback = cashbackState(giftCard);
  const outcome = outcomeText(giftCard);
  return (
    <>
      <ThemedText type="smallBold">
        {money.ctx(giftCard.cardFiatAmount, giftCard.cardFiatCurrency)} {giftCard.merchantName}
      </ThemedText>
      <ThemedText type="small">{giftCardStatusLabel(giftCard.status)}</ThemedText>
      {outcome && <ThemedText type="small">{outcome}</ThemedText>}
      {giftCard.paymentCryptoAmount && (
        <ThemedText type="small">
          Paid: {money.payment(giftCard.paymentCryptoAmount, giftCard.paymentCryptoCurrency ?? '')}
        </ThemedText>
      )}
      {cashback !== 'none' && (
        <ThemedText type="small">
          Cashback: {money.ctx(giftCard.cashbackAmount ?? '', giftCard.cashbackCurrency ?? '')},{' '}
          {cashbackStateLabel(cashback)}
        </ThemedText>
      )}
      <GiftCardDetails giftCard={giftCard} />
      <OrderHelp giftCard={giftCard} />
    </>
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
