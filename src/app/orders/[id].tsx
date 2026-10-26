import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { Button, Notice } from '@/components/form';
import { GiftCardDetails } from '@/components/gift-card-details';
import { useScrimScroll } from '@/components/home-panel';
import { OrderHelp } from '@/components/order-help';
import { useOnSignIn, useSignIn } from '@/components/sign-in';
import { OrderDetailSkeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  BottomTabInset,
  Brand,
  FontFamily,
  MaxContentWidth,
  Motion,
  Radius,
  Spacing,
} from '@/constants/theme';
import { ctx, type GiftCard } from '@/ctx/client';
import {
  cashbackState,
  cashbackStateLabel,
  giftCardStatusLabel,
  outcomeText,
  pollIntervalMs,
} from '@/ctx/gift-card-status';
import { useSessionOwner } from '@/hooks/use-session-owner';
import { useTheme } from '@/hooks/use-theme';
import { dates, money } from '@/money';

const signInMessage = 'Sign in to see this order.';

export default function GiftCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [giftCard, setGiftCard] = useState<GiftCard | null>(null);
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const readSession = useSessionOwner();
  const { onScroll, backdrop } = useScrimScroll();
  const { openSignIn } = useSignIn();
  useOnSignIn(() => {
    setGiftCard(null);
    setMessage('');
    setAttempt((count) => count + 1);
  });

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
      <StatusBar style="light" />
      <Animated.View pointerEvents="none" style={backdrop} />
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={styles.content}>
        {(!giftCard || message !== '') && (
          <View style={[styles.body, styles.status]}>
            {!giftCard && !message && <OrderDetailSkeleton />}
            {message !== '' &&
              (message === signInMessage ? (
                <View style={styles.section}>
                  <ThemedText type="heading">{signInMessage}</ThemedText>
                  <Button label="Sign in" variant="primary" onPress={() => openSignIn(signInMessage)} />
                </View>
              ) : (
                <Notice message={message} actionLabel="Try again" onAction={retry} />
              ))}
          </View>
        )}
        {giftCard && <GiftCardSummary giftCard={giftCard} />}
      </Animated.ScrollView>
    </ThemedView>
  );
}

function GiftCardSummary({ giftCard }: { giftCard: GiftCard }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const cashback = cashbackState(giftCard);
  const outcome = outcomeText(giftCard);
  const processing = giftCard.status === 'paid';
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(Motion.state).easing(Motion.easeOut)}
      style={styles.summarySections}>
      <View style={styles.hero}>
        <View style={styles.heroInner}>
          <Text style={styles.heroName} maxFontSizeMultiplier={1.6}>
            {giftCard.merchantName}
          </Text>
          <Text style={styles.heroAmount} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
            {money.ctx(giftCard.cardFiatAmount, giftCard.cardFiatCurrency)}
          </Text>
          <View style={styles.heroStatus}>
            {processing && <ActivityIndicator size="small" color={Brand.onRoyal} />}
            <Text style={styles.heroStatusText} accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.6}>
              {processing ? 'Processing. Your code shows here when it is ready.' : giftCardStatusLabel(giftCard.status)}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.body, styles.section]}>
        {outcome ? <Notice message={outcome} /> : null}

        <GiftCardDetails giftCard={giftCard} />

        {(giftCard.paymentCryptoAmount || cashback !== 'none') && (
          <View
            style={[
              styles.summary,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}>
            {giftCard.paymentCryptoAmount && (
              <SummaryRow
                label="Paid"
                value={money.ctx(giftCard.paymentCryptoAmount, giftCard.paymentCryptoCurrency ?? '')}
              />
            )}
            {cashback !== 'none' && (
              <SummaryRow
                label={`Cashback, ${cashbackStateLabel(cashback)}`}
                value={money.ctx(giftCard.cashbackAmount ?? '', giftCard.cashbackCurrency ?? '')}
                tone={cashback === 'reversed' ? 'danger' : 'success'}
              />
            )}
            <SummaryRow label="Ordered" value={dates.day(giftCard.created)} />
          </View>
        )}

        <OrderHelp giftCard={giftCard} />
      </View>
    </Animated.View>
  );
}

function SummaryRow({
  label,
  value,
  tone = 'text',
}: {
  label: string;
  value: string;
  tone?: 'text' | 'success' | 'danger';
}) {
  return (
    <View style={styles.summaryRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold" themeColor={tone} style={styles.summaryValue}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: BottomTabInset + Spacing.five,
    gap: Spacing.three,
  },
  body: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
  },
  status: {
    paddingTop: Spacing.three,
  },
  section: {
    gap: Spacing.three,
  },
  summarySections: {
    gap: Spacing.four,
  },
  hero: {
    backgroundColor: Brand.royal,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
  },
  heroInner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.one,
  },
  heroName: {
    color: Brand.onRoyalMuted,
    fontFamily: FontFamily.medium,
    fontSize: 15,
    lineHeight: 20,
  },
  heroAmount: {
    color: Brand.onRoyal,
    fontFamily: FontFamily.bold,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -1,
  },
  heroStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  heroStatusText: {
    flex: 1,
    color: Brand.onRoyal,
    fontFamily: FontFamily.semibold,
    fontSize: 15,
    lineHeight: 20,
  },
  summary: {
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 40,
  },
  summaryValue: {
    flexShrink: 1,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});
