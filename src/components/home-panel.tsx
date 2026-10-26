import { useScrollToTop } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useRef, type ComponentProps, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Odometer } from '@/components/odometer';
import { Wordmark } from '@/components/wordmark';
import { Brand, FontFamily, Layout, MaxContentWidth, Spacing } from '@/constants/theme';
import type { HoldingsView } from '@/hooks/use-holdings';
import { usePageLayout } from '@/hooks/use-page-layout';
import { money } from '@/money';
import { units } from '@/stellar/units';
import { Savings } from '@/wallet/savings';

const scrimFadeDistance = 160;
const balanceStyle = {
  fontFamily: FontFamily.semibold,
  fontSize: 54,
  lineHeight: 62,
  letterSpacing: -1.5,
  color: Brand.onRoyal,
};

type Scrollable = NonNullable<Parameters<typeof useScrollToTop>[0]['current']>;

export function useScrimScroll<T extends Scrollable = ScrollViewInstance>() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<T>(null);
  useScrollToTop(scrollRef);
  const offset = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    offset.value = event.contentOffset.y;
  });
  const fade = useAnimatedStyle(() => ({
    opacity: interpolate(offset.value, [0, scrimFadeDistance], [0, 1], 'clamp'),
  }));
  const overscroll = useAnimatedStyle(() => ({
    height: Math.max(0, -offset.value),
  }));
  const scrim = [styles.scrim, { height: insets.top }, webBlur, fade];
  const backdrop = [styles.backdrop, overscroll];
  return { scrollRef, onScroll, scrim, backdrop };
}

const webBlur = Platform.OS === 'web' ? ({ backdropFilter: 'blur(16px)' } as object) : null;
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

export function StatusBarScrim({ style }: { style: ComponentProps<typeof Animated.View>['style'] }) {
  if (Platform.OS === 'ios') {
    return <AnimatedBlurView pointerEvents="none" intensity={40} tint="dark" style={style} />;
  }
  return <Animated.View pointerEvents="none" style={style} />;
}

type HomePanelProps = {
  view: HoldingsView | null;
  children?: ReactNode;
};

export function HomePanel({ view, children }: HomePanelProps) {
  const insets = useSafeAreaInsets();
  const { wide, gutter } = usePageLayout();
  return (
    <View style={[styles.panel, { paddingTop: insets.top + (wide ? Spacing.five : Spacing.three) }]}>
      <View style={[styles.inner, wide && { maxWidth: Layout.pageMaxWidth, paddingHorizontal: gutter }]}>
        {!wide && <Wordmark height={22} />}
        <Balance view={view} />
        {children}
      </View>
    </View>
  );
}

function Balance({ view }: { view: HoldingsView | null }) {
  const stable = view?.stable;
  const total = view && stable ? view.holdings.totalIn(stable) : null;
  const formatted = total !== null && stable ? money.ctx(units.format(total, units.decimals), stable) : null;
  const unavailable = view !== null && !stable;
  return (
    <View style={styles.balanceBlock}>
      <Text style={styles.balanceLabel} maxFontSizeMultiplier={1.4}>
        Total balance
      </Text>
      {formatted ? (
        <Odometer value={formatted} style={balanceStyle} />
      ) : unavailable ? (
        <Text style={styles.unavailable} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
          Balance unavailable
        </Text>
      ) : (
        <View style={styles.balancePlaceholder} accessibilityLabel="Loading your money" />
      )}
      <Text style={styles.stateLine} accessibilityLiveRegion="polite">
        {accountState(view)}
      </Text>
    </View>
  );
}

function accountState(view: HoldingsView | null): string {
  if (!view) {
    return 'Checking your account';
  }
  const { holdings, stable, problem } = view;
  if (problem !== '') {
    return problem;
  }
  const format = (value: bigint) => (stable ? money.ctx(units.format(value, units.decimals), stable) : '');
  const onTheWay = stable ? holdings.onTheWayIn(stable) : null;
  if (onTheWay !== null && onTheWay > 0n) {
    return `${format(onTheWay)} cashback on the way`;
  }
  const savings = holdings.savings();
  if (savings > 0n) {
    return `${money.token(savings, Savings.currency)} in savings`;
  }
  const total = stable ? holdings.totalIn(stable) : null;
  if (total === 0n) {
    return 'Add money to start buying gift cards';
  }
  return 'Pay with Loop and earn cashback on every gift card';
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: Brand.royal,
    paddingBottom: Spacing.five,
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.four,
  },
  balanceBlock: {
    gap: Spacing.one,
  },
  balanceLabel: {
    color: Brand.onRoyalMuted,
    fontFamily: FontFamily.medium,
    fontSize: 15,
    lineHeight: 20,
  },
  balancePlaceholder: {
    height: balanceStyle.lineHeight,
    width: '55%',
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  unavailable: {
    color: Brand.onRoyal,
    fontFamily: FontFamily.semibold,
    fontSize: 32,
    lineHeight: balanceStyle.lineHeight,
    letterSpacing: -0.8,
  },
  stateLine: {
    marginTop: Spacing.one,
    color: Brand.onRoyalMuted,
    fontFamily: FontFamily.medium,
    fontSize: 15,
    lineHeight: 20,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: Brand.royal,
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: Brand.scrim,
  },
});
