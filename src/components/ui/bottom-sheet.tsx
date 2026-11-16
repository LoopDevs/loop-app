import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, SlideInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppLockScope } from '@/components/app-lock';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { ThemedText } from '@/components/ui/themed-text';
import { Elevation, Layout, Motion, Radius, Spacing } from '@/constants/theme';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useTheme } from '@/hooks/use-theme';

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
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
      <AppLockScope>
      <KeyboardAvoid>
        <View style={[styles.backdrop, wide ? styles.backdropWide : styles.backdropNarrow]}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]}
            onPress={onClose}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            aria-hidden
            tabIndex={-1}
          />
          <Animated.View
            entering={entering}
            accessibilityViewIsModal
            onAccessibilityEscape={onClose}
            style={[
              styles.panel,
              { backgroundColor: theme.background },
              wide ? styles.panelWide : [styles.panelNarrow, { paddingBottom: insets.bottom + Spacing.three }],
            ]}>
            <View style={styles.content}>
              {!wide && <View style={[styles.grabber, { backgroundColor: theme.backgroundSelected }]} />}
              <ThemedText type="subtitle" accessibilityRole="header">
                {title}
              </ThemedText>
              {children}
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoid>
      </AppLockScope>
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
