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
import { Elevation, FontFamily, Radius, Spacing } from '@/constants/theme';
import type { HoldingsView } from '@/hooks/use-holdings';
import { useTheme } from '@/hooks/use-theme';
import { money } from '@/money';
import { units } from '@/stellar/units';
import { Savings } from '@/wallet/savings';

const scrimFadeDistance = 48;
const balanceType = {
  fontFamily: FontFamily.semibold,
  fontSize: 36,
  lineHeight: 42,
  letterSpacing: -1,
};

type Scrollable = NonNullable<Parameters<typeof useScrollToTop>[0]['current']>;

export function useScrimScroll<T extends Scrollable = ScrollViewInstance>() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const scrollRef = useRef<T>(null);
  useScrollToTop(scrollRef);
  const offset = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    offset.value = event.contentOffset.y;
  });
  const fade = useAnimatedStyle(() => ({
    opacity: interpolate(offset.value, [0, scrimFadeDistance], [0, 1], 'clamp'),
  }));
  const scrim = [
    styles.scrim,
    { height: insets.top, backgroundColor: theme.chrome, borderBottomColor: theme.border },
    webBlur,
    fade,
  ];
  return { scrollRef, onScroll, scrim };
}

const webBlur = Platform.OS === 'web' ? ({ backdropFilter: 'blur(16px)' } as object) : null;
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

export function StatusBarScrim({ style }: { style: ComponentProps<typeof Animated.View>['style'] }) {
  if (Platform.OS === 'ios') {
    return <AnimatedBlurView pointerEvents="none" intensity={60} tint="systemChromeMaterial" style={style} />;
  }
  return <Animated.View pointerEvents="none" style={style} />;
}

type BalanceCardProps = {
  view: HoldingsView | null;
  children?: ReactNode;
};

export function BalanceCard({ view, children }: BalanceCardProps) {
  const theme = useTheme();
  return (
    <View
      style={[styles.card, Elevation.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <Balance view={view} />
      {children}
    </View>
  );
}

function Balance({ view }: { view: HoldingsView | null }) {
  const theme = useTheme();
  const stable = view?.stable;
  const total = view && stable ? view.holdings.totalIn(stable) : null;
  const formatted = total !== null && stable ? money.ctx(units.format(total, units.decimals), stable) : null;
  const unavailable = view !== null && !stable;
  return (
    <View style={styles.balanceBlock}>
      <Text style={[styles.balanceLabel, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.4}>
        Total balance
      </Text>
      {formatted ? (
        <Odometer value={formatted} style={{ ...balanceType, color: theme.text }} />
      ) : unavailable ? (
        <Text
          style={[styles.unavailable, { color: theme.text }]}
          accessibilityRole="header"
          maxFontSizeMultiplier={1.3}>
          Balance unavailable
        </Text>
      ) : (
        <View
          style={[styles.balancePlaceholder, { backgroundColor: theme.backgroundSelected }]}
          accessibilityLabel="Loading your money"
        />
      )}
      <Text
        style={[styles.stateLine, { color: theme.textSecondary }]}
        accessibilityLiveRegion="polite">
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
  card: {
    padding: Spacing.four,
    gap: Spacing.four,
    borderRadius: Radius.card,
    borderWidth: 1,
  },
  balanceBlock: {
    gap: Spacing.one,
  },
  balanceLabel: {
    fontFamily: FontFamily.medium,
    fontSize: 15,
    lineHeight: 20,
  },
  balancePlaceholder: {
    height: balanceType.lineHeight,
    width: '55%',
    borderRadius: 8,
  },
  unavailable: {
    fontFamily: FontFamily.semibold,
    fontSize: 32,
    lineHeight: balanceType.lineHeight,
    letterSpacing: -0.8,
  },
  stateLine: {
    marginTop: Spacing.one,
    fontFamily: FontFamily.medium,
    fontSize: 15,
    lineHeight: 20,
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
