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
import { SiteFooter } from '@/components/site-footer';
import { OrderDetailSkeleton } from '@/components/skeleton';
import { SplitLayout } from '@/components/split-layout';
import { PageWidth } from '@/components/storefront';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  FontFamily,
  Layout,
  MaxContentWidth,
  Motion,
  Radius,
  ScrollEndInset,
  Spacing,
} from '@/constants/theme';
import { ctx, type GiftCard } from '@/ctx/client';
import {
  cashbackState,
  cashbackStateLabel,
  giftCardStatusLabel,
  outcomeText,
  pollIntervalMs,
  wasCharged,
} from '@/ctx/gift-card-status';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useSentPayment } from '@/hooks/use-sent-payment';
import { useSessionOwner } from '@/hooks/use-session-owner';
import { useTheme } from '@/hooks/use-theme';
import { dates, money } from '@/money';
import { stablePeg, type PaymentCurrency } from '@/stellar/network';

const signInMessage = 'Sign in to see this order.';

export default function GiftCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [giftCard, setGiftCard] = useState<GiftCard | null>(null);
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const readSession = useSessionOwner();
  const { onScroll } = useScrimScroll();
  const { openSignIn } = useSignIn();
  const { wide } = usePageLayout();
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
      <StatusBar style="dark" />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.content}>
        {(!giftCard || message !== '') && (
          <View style={[styles.body, styles.status, wide && styles.wideStatus]}>
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
        {giftCard && <GiftCardSummary giftCard={giftCard} wide={wide} />}
        <SiteFooter />
      </Animated.ScrollView>
    </ThemedView>
  );
}

function amountInMoney(amount: string | null | undefined, currency: string | null | undefined): string | null {
  if (!amount || !currency) {
    return null;
  }
  if (Object.hasOwn(stablePeg, currency) && !stablePeg[currency as PaymentCurrency]) {
    return null;
  }
  return money.ctx(amount, currency);
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function GiftCardSummary({ giftCard, wide }: { giftCard: GiftCard; wide: boolean }) {
  const theme = useTheme();
  const { gutter } = usePageLayout();
  const reduceMotion = useReducedMotion();
  const cashback = cashbackState(giftCard);
  const sent = useSentPayment(giftCard.paymentId);
  const outcome = sent === undefined ? null : outcomeText(giftCard, sent !== null);
  const processing = giftCard.status === 'paid';
  const paid = wasCharged(giftCard)
    ? amountInMoney(giftCard.paymentCryptoAmount, giftCard.paymentCryptoCurrency)
    : null;
  const cashbackAmount = amountInMoney(giftCard.cashbackAmount, giftCard.cashbackCurrency);
  const pageWidth = wide ? { maxWidth: Layout.pageMaxWidth, paddingHorizontal: gutter } : null;

  const summary = (paid || cashback !== 'none') && (
    <View
      style={[
        styles.summary,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
        },
      ]}>
      {paid && <SummaryRow label="Paid" value={paid} />}
      {cashback !== 'none' && (
        <SummaryRow
          label={cashbackAmount ? `Cashback, ${cashbackStateLabel(cashback)}` : 'Cashback'}
          value={cashbackAmount ?? sentenceCase(cashbackStateLabel(cashback))}
          tone={cashback === 'reversed' ? 'danger' : 'success'}
        />
      )}
      <SummaryRow label="Ordered" value={dates.day(giftCard.created)} />
    </View>
  );

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(Motion.state).easing(Motion.easeOut)}
      style={styles.summarySections}>
      <View style={styles.hero}>
        <View style={[styles.heroInner, pageWidth]}>
          <Text style={[styles.heroName, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.6}>
            {giftCard.merchantName}
          </Text>
          <Text style={[styles.heroAmount, { color: theme.text }]} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
            {money.ctx(giftCard.cardFiatAmount, giftCard.cardFiatCurrency)}
          </Text>
          <View style={styles.heroStatus}>
            {processing && <ActivityIndicator size="small" color={theme.textSecondary} />}
            <Text style={[styles.heroStatusText, { color: theme.text }]} accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.6}>
              {processing ? 'Processing. Your code shows here when it is ready.' : giftCardStatusLabel(giftCard.status)}
            </Text>
          </View>
        </View>
      </View>

      {wide ? (
        <PageWidth>
          <SplitLayout
            asideWidth={360}
            aside={
              <>
                {summary}
                <OrderHelp giftCard={giftCard} />
              </>
            }>
            {outcome ? <Notice message={outcome} /> : null}
            <GiftCardDetails giftCard={giftCard} />
          </SplitLayout>
        </PageWidth>
      ) : (
        <View style={[styles.body, styles.section]}>
          {outcome ? <Notice message={outcome} /> : null}
          <GiftCardDetails giftCard={giftCard} />
          {summary}
          <OrderHelp giftCard={giftCard} />
        </View>
      )}
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
    flexGrow: 1,
    paddingBottom: ScrollEndInset,
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
  wideStatus: {
    maxWidth: 560,
    paddingTop: Spacing.five,
  },
  section: {
    gap: Spacing.three,
  },
  summarySections: {
    gap: Spacing.four,
  },
  hero: {
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
    fontFamily: FontFamily.medium,
    fontSize: 15,
    lineHeight: 20,
  },
  heroAmount: {
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
