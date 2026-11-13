import { useCallback } from 'react';
import { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

const bumpScale = 1.2;
const swell = { damping: 40, stiffness: 400 };
const settle = { damping: 36, stiffness: 300 };

export function useBump() {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const bump = useCallback(() => {
    if (reduceMotion) {
      return;
    }
    scale.set(withSequence(withSpring(bumpScale, swell), withSpring(1, settle)));
  }, [reduceMotion, scale]);
  return { style, bump };
}
