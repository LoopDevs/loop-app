import { useEffect } from 'react';
import { type DimensionValue, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Radius, Spacing } from '@/constants/theme';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useTheme } from '@/hooks/use-theme';

const shimmerMs = 800;
const orderRowCount = 6;
const merchantSkeletonRows = 2;
const merchantTileHeight = 230;
const coverAspect = 1.586;

type SkeletonProps = {
  width: DimensionValue;
  height?: number;
  aspectRatio?: number;
  color?: string;
};

export function Skeleton({ width, height, aspectRatio, color }: SkeletonProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) {
      opacity.set(1);
      return;
    }
    opacity.set(withRepeat(withTiming(0.45, { duration: shimmerMs }), -1, true));
    return () => cancelAnimation(opacity);
  }, [reducedMotion, opacity]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <Animated.View
      style={[
        styles.block,
        { width, height, aspectRatio, backgroundColor: color ?? theme.backgroundSelected },
        animated,
      ]}
    />
  );
}

export function BalanceSkeleton() {
  return (
    <View style={styles.stack} accessible accessibilityLabel="Loading balances">
      <Skeleton width="40%" height={14} />
      <Skeleton width="70%" height={20} />
      <Skeleton width="60%" height={20} />
      <Skeleton width="55%" height={20} />
    </View>
  );
}

export function OrderRowsSkeleton() {
  return (
    <View style={styles.stack} accessible accessibilityLabel="Loading orders">
      {Array.from({ length: orderRowCount }, (_, index) => (
        <Skeleton key={index} width="100%" height={72} />
      ))}
    </View>
  );
}

export function MerchantGridSkeleton({ columns, rows = merchantSkeletonRows }: { columns?: number; rows?: number }) {
  const layout = usePageLayout();
  const count = columns ?? layout.columns;
  return (
    <View style={styles.grid} accessible accessibilityLabel="Loading gift cards">
      {Array.from({ length: count * rows }, (_, index) => (
        <View key={index} style={[styles.gridCell, { width: `${100 / count}%` }]}>
          <Skeleton width="100%" height={merchantTileHeight} />
        </View>
      ))}
    </View>
  );
}

export function OrderDetailSkeleton() {
  return (
    <View style={styles.stack} accessible accessibilityLabel="Loading">
      <Skeleton width="100%" aspectRatio={coverAspect} />
      <Skeleton width="60%" height={24} />
      <Skeleton width="35%" height={16} />
      <Skeleton width="100%" height={120} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    borderRadius: Radius.tile,
  },
  stack: {
    gap: Spacing.two,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: Spacing.four,
    marginHorizontal: -Spacing.two,
  },
  gridCell: {
    paddingHorizontal: Spacing.two,
  },
});
