import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { GiftCardFace, giftCardAspectRatio } from '@/components/gift-card-face';
import { Wordmark } from '@/components/wordmark';
import { FontFamily, Radius, Spacing } from '@/constants/theme';
import type { GiftCard } from '@/ctx/client';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/native/haptics';

const entranceMs = 420;
const flipDelayMs = 650;
const flipMs = 720;

export const giftCardRevealMs = flipDelayMs + flipMs;

export function GiftCardReveal({ giftCard }: { giftCard: GiftCard }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const entrance = useSharedValue(reduceMotion ? 1 : 0);
  const flip = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      return;
    }
    entrance.value = withTiming(1, { duration: entranceMs, easing: Easing.out(Easing.cubic) });
    flip.value = withDelay(flipDelayMs, withTiming(1, { duration: flipMs, easing: Easing.inOut(Easing.cubic) }));
    const timer = setTimeout(() => haptics.tap(), flipDelayMs + flipMs / 2);
    return () => clearTimeout(timer);
  }, [entrance, flip, reduceMotion]);

  const liftStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [
      { translateY: (1 - entrance.value) * 48 },
      { scale: interpolate(flip.value, [0, 0.5, 1], [0.92, 1.04, 1]) * (0.9 + entrance.value * 0.1) },
    ],
  }));

  const backStyle = useAnimatedStyle(() => ({
    opacity: flip.value < 0.5 ? 1 : 0,
    transform: [{ perspective: 1200 }, { rotateY: `${flip.value * 180}deg` }],
  }));

  const frontStyle = useAnimatedStyle(() => ({
    opacity: flip.value >= 0.5 ? 1 : 0,
    transform: [{ perspective: 1200 }, { rotateY: `${flip.value * 180 - 180}deg` }],
  }));

  return (
    <Animated.View style={[styles.stage, liftStyle]}>
      <Animated.View style={[styles.face, frontStyle]}>
        <GiftCardFace giftCard={giftCard} />
      </Animated.View>
      <Animated.View
        accessible={false}
        style={[styles.face, styles.back, { backgroundColor: theme.accent }, backStyle]}>
        <View style={[styles.ring, { borderColor: theme.onAccent }]} />
        <Wordmark height={28} color={theme.onAccent} />
        <Text style={[styles.backLabel, { color: theme.onAccent }]} maxFontSizeMultiplier={1.3}>
          Your gift card
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stage: {
    width: '100%',
    aspectRatio: giftCardAspectRatio,
  },
  face: {
    ...StyleSheet.absoluteFill,
    backfaceVisibility: 'hidden',
  },
  back: {
    borderRadius: Radius.large,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  ring: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 28,
    opacity: 0.08,
  },
  backLabel: {
    fontFamily: FontFamily.medium,
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.8,
  },
});
