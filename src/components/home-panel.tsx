import type { ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Odometer } from '@/components/odometer';
import { Wordmark } from '@/components/wordmark';
import { Brand, FontFamily, MaxContentWidth, Spacing } from '@/constants/theme';
import type { HoldingsView } from '@/hooks/use-holdings';
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

export function useScrimScroll() {
  const insets = useSafeAreaInsets();
  const offset = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    offset.value = event.contentOffset.y;
  });
  const fade = useAnimatedStyle(() => ({
    opacity: interpolate(offset.value, [0, scrimFadeDistance], [0, 1], 'clamp'),
  }));
  const scrim = [styles.scrim, { height: insets.top }, webBlur, fade];
  return { onScroll, scrim };
}

const webBlur = Platform.OS === 'web' ? ({ backdropFilter: 'blur(16px)' } as object) : null;

type HomePanelProps = {
  view: HoldingsView | null;
  signedIn: boolean;
  children?: ReactNode;
};

export function HomePanel({ view, signedIn, children }: HomePanelProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.panel, { paddingTop: insets.top + Spacing.three }]}>
      <View style={styles.inner}>
        <Wordmark height={22} />
        {signedIn ? (
          <Balance view={view} />
        ) : (
          <Text style={styles.pitch} accessibilityRole="header">
            Gift cards that pay you back.
          </Text>
        )}
        {children}
      </View>
    </View>
  );
}

function Balance({ view }: { view: HoldingsView | null }) {
  const stable = view?.stable;
  const total = view && stable ? view.holdings.totalIn(stable) : null;
  const formatted = total !== null && stable ? money.ctx(units.format(total, units.decimals), stable) : null;
  return (
    <View style={styles.balanceBlock}>
      {formatted ? (
        <Odometer value={formatted} style={balanceStyle} />
      ) : (
        <View style={styles.balancePlaceholder} accessibilityLabel="Loading your money" />
      )}
      <View style={styles.rule} />
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
    paddingBottom: Spacing.four,
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.four,
  },
  pitch: {
    color: Brand.onRoyal,
    fontFamily: FontFamily.bold,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1,
    paddingBottom: Spacing.three,
  },
  balanceBlock: {
    gap: Spacing.three,
  },
  balancePlaceholder: {
    height: balanceStyle.lineHeight,
    width: '55%',
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  rule: {
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  stateLine: {
    color: Brand.onRoyalMuted,
    fontFamily: FontFamily.medium,
    fontSize: 15,
    lineHeight: 20,
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: Brand.scrim,
  },
});
