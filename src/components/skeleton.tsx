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

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const shimmerMs = 800;
const orderRowCount = 6;

export function Skeleton({ width, height }: { width: DimensionValue; height: number }) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) {
      opacity.set(1);
      return;
    }
    opacity.set(withRepeat(withTiming(0.4, { duration: shimmerMs }), -1, true));
    return () => cancelAnimation(opacity);
  }, [reducedMotion, opacity]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <Animated.View
      style={[styles.block, { width, height, backgroundColor: theme.backgroundElement }, animated]}
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
        <Skeleton key={index} width="100%" height={64} />
      ))}
    </View>
  );
}

export function OrderDetailSkeleton() {
  return (
    <View style={styles.stack} accessible accessibilityLabel="Loading order">
      <Skeleton width="60%" height={20} />
      <Skeleton width="35%" height={16} />
      <Skeleton width="50%" height={16} />
      <Skeleton width="100%" height={120} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    borderRadius: Spacing.two,
  },
  stack: {
    gap: Spacing.two,
  },
});
