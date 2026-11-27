import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Button, Notice } from '@/components/ui/form';
import { useScrimScroll } from '@/components/home-panel';
import { SavingsCard } from '@/components/home-overview';
import { PageHeader } from '@/components/page-header';
import { SavingsTicker } from '@/components/savings-ticker';
import { useSignIn } from '@/components/sign-in';
import { SiteFooter } from '@/components/site-footer';
import { SplitLayout } from '@/components/split-layout';
import { PageWidth } from '@/components/storefront';
import { Skeleton } from '@/components/ui/skeleton';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { FontFamily, Radius, ScrollEndInset, Spacing } from '@/constants/theme';
import { Rates } from '@/ctx/rates';
import type { HoldingsView } from '@/hooks/use-holdings';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useTheme } from '@/hooks/use-theme';
import { useWallet } from '@/hooks/use-wallet';
import { money } from '@/money';
import { units } from '@/stellar/units';
import { Savings, SavingsRate } from '@/wallet/savings';

export default function SavingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { wide } = usePageLayout();
  const { openSignIn } = useSignIn();
  const { state, view, refresh, reload, problem } = useWallet();
  const { scrollRef, onScroll, scrim } = useScrimScroll();
  const [refreshing, setRefreshing] = useState(false);

  const pullToRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <ThemedView style={styles.container}>
      <StatusBar style="dark" />
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          state === 'ready' ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={pullToRefresh}
              tintColor={theme.textSecondary}
              colors={[theme.accent]}
            />
          ) : undefined
        }
        contentContainerStyle={styles.scroll}>
        <PageHeader title="Savings" width="page" />
        <PageWidth style={[styles.page, wide && styles.pageWide]}>
          <SplitLayout aside={wide ? <SavingsFacts /> : null} asideWidth={360}>
          <View style={[styles.hero, wide && styles.heroWide, { backgroundColor: theme.accentSoft }]}>
            <View style={styles.heroTop}>
              <View style={[styles.heroIcon, { backgroundColor: theme.accent }]}>
                <SymbolView
                  name={{ ios: 'leaf', android: 'savings', web: 'savings' }}
                  size={22}
                  tintColor={theme.onAccent}
                />
              </View>
              {state === 'ready' && (
                <View style={[styles.ratePill, { backgroundColor: theme.accent }]}>
                  <LiveDot color={theme.onAccent} />
                  <Text style={[styles.ratePillText, { color: theme.onAccent }]} maxFontSizeMultiplier={1.3}>
                    {Savings.rateHeadline(view?.stable)}
                  </Text>
                </View>
              )}
            </View>
            {state === 'ready' ? (
              <SavingsBalance view={view} />
            ) : (
              <>
                <ThemedText type={wide ? 'title' : 'subtitle'} accessibilityRole="header" style={styles.heroTitle}>
                  {Savings.rateHeadline()}
                </ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.heroLine}>
                  Your savings grow every day. Your cashback lands here too, and you can take it out whenever you
                  like.
                </ThemedText>
              </>
            )}
          </View>

          {state === 'setup' && (
            <Notice
              tone="neutral"
              message="Finish setting up Loop on Home to start saving."
              actionLabel="Go to Home"
              onAction={() => router.navigate('/')}
            />
          )}

          {state === 'blocked' && (
            <Notice tone="neutral" message={problem} actionLabel="Go to Home" onAction={() => router.navigate('/')} />
          )}

          {state === 'failed' && (
            <Notice message={problem || "We couldn't load your savings."} actionLabel="Try again" onAction={reload} />
          )}

          {state === 'ready' && (
            <SavingsCard
              view={view}
              onCashOut={() => router.push('/wallet/cash-out')}
              onShop={() => router.navigate('/shop')}
            />
          )}

          {state === 'signed-out' && (
            <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <ThemedText type="heading">Save with your cashback</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Sign in to see your savings and how much they have grown.
              </ThemedText>
              <Button label="Sign in" variant="primary" onPress={() => openSignIn('Sign in to see your savings.')} />
            </View>
          )}

          {!wide && <SavingsFacts />}
          </SplitLayout>
        </PageWidth>
        <SiteFooter />
      </Animated.ScrollView>
      <Animated.View pointerEvents="none" style={scrim} />
    </ThemedView>
  );
}

const savingsFacts = [
  {
    icon: { ios: 'arrow.down.circle', android: 'south', web: 'south' },
    title: 'Cashback goes in by itself',
    body: 'Cashback from every gift card lands in your savings once the card is delivered.',
  },
  {
    icon: { ios: 'chart.line.uptrend.xyaxis', android: 'trending_up', web: 'trending_up' },
    title: 'It grows every day',
    body: 'Your savings earn every day. The rate can go up or down over time.',
  },
  {
    icon: { ios: 'arrow.uturn.backward', android: 'replay', web: 'replay' },
    title: 'Spend it or cash out any time',
    body: 'Pay for gift cards from your savings, or cash out to your bank.',
  },
] as const;

function SavingsBalance({ view }: { view: HoldingsView | null }) {
  if (!view) {
    return (
      <>
        <ThemedText type="small" themeColor="textSecondary">
          Savings
        </ThemedText>
        <Skeleton width={160} height={40} />
      </>
    );
  }
  const stable = view.stable ?? Rates.usd;
  const [first] = view.holdings.savingsHoldings();
  const rate = first ? SavingsRate.fixedFor(first.currency) : null;
  const earned = view.account?.receivedCashback(new Set([stable])) ?? 0n;
  const earnedLine =
    earned > 0n
      ? `${money.ctx(units.format(earned, units.decimals), stable)} cashback earned so far`
      : 'Your cashback lands here and earns interest every day.';
  return (
    <>
      <ThemedText type="small" themeColor="textSecondary">
        Savings
      </ThemedText>
      {first && rate ? (
        <SavingsTicker value={first.amount} currency={first.currency} rate={rate} />
      ) : (
        <ThemedText type="title" accessibilityRole="header" style={styles.heroBalance}>
          {first ? money.token(first.amount, first.currency) : money.ctx('0', stable)}
        </ThemedText>
      )}
      {rate && (
        <ThemedText themeColor="textSecondary" style={styles.heroLine}>
          {`Growing ${rate.figure()} a year, added to your savings every day.`}
        </ThemedText>
      )}
      <ThemedText themeColor="textSecondary" style={styles.heroLine}>
        {earnedLine}
      </ThemedText>
    </>
  );
}

function SavingsFacts() {
  const router = useRouter();
  const theme = useTheme();
  return (
    <View style={[styles.card, styles.facts, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText type="heading" accessibilityRole="header">
        How savings work
      </ThemedText>
      {savingsFacts.map((fact) => (
        <View key={fact.title} style={styles.fact}>
          <View style={[styles.factIcon, { backgroundColor: theme.accentSoft }]}>
            <SymbolView name={fact.icon} size={18} tintColor={theme.accent} />
          </View>
          <View style={styles.factText}>
            <ThemedText type="smallBold">{fact.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {fact.body}
            </ThemedText>
          </View>
        </View>
      ))}
      <ThemedText type="small" themeColor="textSecondary">
        {Savings.riskNote}
      </ThemedText>
      <Button label="Read the FAQ" variant="quiet" onPress={() => router.navigate('/faq')} />
    </View>
  );
}

const livePulseMs = 1400;

function LiveDot({ color }: { color: string }) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      return;
    }
    pulse.set(withRepeat(withTiming(1, { duration: livePulseMs, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [pulse, reduceMotion]);
  const halo = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 1.4 }],
  }));
  return (
    <View style={styles.liveDotWrap}>
      <Animated.View style={[styles.liveDot, styles.liveHalo, { backgroundColor: color }, halo]} />
      <View style={[styles.liveDot, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: ScrollEndInset,
  },
  page: {
    paddingTop: Spacing.two,
  },
  pageWide: {
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
  },
  hero: {
    padding: Spacing.four,
    gap: Spacing.two,
    borderRadius: Radius.large,
  },
  heroWide: {
    padding: Spacing.five,
    gap: Spacing.three,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  ratePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
  },
  liveDotWrap: {
    width: 8,
    height: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  liveHalo: {
    position: 'absolute',
  },
  ratePillText: {
    fontFamily: FontFamily.semibold,
    fontSize: 13,
    lineHeight: 18,
  },
  heroBalance: {
    fontVariant: ['tabular-nums'],
  },
  heroTitle: {
    maxWidth: 560,
  },
  heroLine: {
    maxWidth: 520,
  },
  facts: {
    gap: Spacing.four,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  factIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  factText: {
    flex: 1,
    gap: Spacing.half,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  card: {
    padding: Spacing.four,
    gap: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
