import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Motion } from '@/constants/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressScaleProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  scale?: number;
};

export function PressScale({ style, scale = Motion.pressScale, onPressIn, onPressOut, ...rest }: PressScaleProps) {
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : 1 - pressed.value * (1 - scale) }],
    opacity: reduceMotion ? 1 - pressed.value * 0.25 : 1,
  }));
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(event) => {
        pressed.value = withTiming(1, { duration: Motion.feedback, easing: Motion.easeOut });
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        pressed.value = withTiming(0, { duration: Motion.state, easing: Motion.easeOut });
        onPressOut?.(event);
      }}
      style={[style, animated]}
    />
  );
}
