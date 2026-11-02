import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, SlideInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { ThemedText } from '@/components/ui/themed-text';
import { Elevation, Layout, Motion, Radius, Spacing } from '@/constants/theme';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useTheme } from '@/hooks/use-theme';

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel?: string;
  children: ReactNode;
};

export function BottomSheet({ open, onClose, title, closeLabel = 'Close', children }: BottomSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { wide } = usePageLayout();
  const reduceMotion = useReducedMotion();
  const entering = reduceMotion
    ? undefined
    : wide
      ? FadeInDown.duration(Motion.state).easing(Motion.easeOut)
      : SlideInDown.duration(Motion.transition).easing(Motion.easeOut);

  return (
    <Modal transparent visible={open} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoid>
        <Pressable
          style={[styles.backdrop, { backgroundColor: theme.scrim }, wide ? styles.backdropWide : styles.backdropNarrow]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}>
          <Animated.View
            entering={entering}
            style={[
              styles.panel,
              { backgroundColor: theme.background },
              wide ? styles.panelWide : [styles.panelNarrow, { paddingBottom: insets.bottom + Spacing.three }],
            ]}>
            <Pressable accessible={false} style={styles.content}>
              {!wide && <View style={[styles.grabber, { backgroundColor: theme.backgroundSelected }]} />}
              <ThemedText type="subtitle" accessibilityRole="header">
                {title}
              </ThemedText>
              {children}
            </Pressable>
          </Animated.View>
        </Pressable>
      </KeyboardAvoid>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  backdropNarrow: {
    justifyContent: 'flex-end',
  },
  backdropWide: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  panel: {
    ...Elevation.sheet,
  },
  panelNarrow: {
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  panelWide: {
    width: '100%',
    maxWidth: Layout.sheetWidth,
    borderRadius: Radius.large,
    padding: Spacing.four,
  },
  content: {
    gap: Spacing.three,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    marginBottom: Spacing.one,
  },
});
