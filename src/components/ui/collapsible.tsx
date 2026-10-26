import { SymbolView } from 'expo-symbols';
import { PropsWithChildren, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Motion, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Collapsible({ children, title }: PropsWithChildren & { title: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const chevron = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: withTiming(isOpen ? '90deg' : '0deg', {
          duration: reduceMotion ? 0 : Motion.state,
          easing: Motion.easeOut,
        }),
      },
    ],
  }));

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        style={({ pressed }) => [styles.heading, pressed && { backgroundColor: theme.backgroundSelected }]}
        onPress={() => setIsOpen((value) => !value)}>
        <ThemedText type="smallBold" style={styles.title}>
          {title}
        </ThemedText>
        <Animated.View style={chevron}>
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
            size={16}
            weight="semibold"
            tintColor={theme.textSecondary}
          />
        </Animated.View>
      </Pressable>
      {isOpen && (
        <Animated.View
          entering={reduceMotion ? undefined : FadeIn.duration(Motion.state)}
          exiting={reduceMotion ? undefined : FadeOut.duration(Motion.exit)}
          style={[styles.content, { borderTopColor: theme.border }]}>
          {children}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: Radius.control,
    overflow: 'hidden',
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
  },
  title: {
    flex: 1,
  },
  content: {
    borderTopWidth: 1,
    padding: Spacing.three,
  },
});
