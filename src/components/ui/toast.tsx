import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset,FontFamily, Motion, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const toastMinLifetimeMs = 2500;
const toastMaxLifetimeMs = 7000;
const toastMsPerCharacter = 70;

export function toastLifetimeMs(text: string): number {
  return Math.min(toastMaxLifetimeMs, Math.max(toastMinLifetimeMs, text.length * toastMsPerCharacter));
}

type Toast = {
  id: number;
  text: string;
};

const ToastContext = createContext<(text: string) => void>(() => {});

export function useToast(): (text: string) => void {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const reduceMotion = useReducedMotion();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const show = useCallback((text: string) => {
    setToast((current) => ({ id: (current?.id ?? 0) + 1, text }));
    AccessibilityInfo.announceForAccessibility(text);
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = setTimeout(() => setToast(null), toastLifetimeMs(toast.text));
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <View
        pointerEvents="none"
        style={[styles.host, { bottom: BottomTabInset + Spacing.four + insets.bottom }]}
        accessibilityLiveRegion={Platform.OS === 'web' ? 'polite' : 'none'}>
        {toast && (
          <Animated.View
            key={toast.id}
            entering={reduceMotion ? undefined : FadeInDown.duration(Motion.state).easing(Motion.easeOut)}
            exiting={reduceMotion ? undefined : FadeOut.duration(Motion.exit)}
            style={[styles.toast, { backgroundColor: theme.inverse, borderColor: theme.border, shadowColor: theme.inverse }]}>
            <Text style={[styles.text, { color: theme.onInverse }]} maxFontSizeMultiplier={1.6}>
              {toast.text}
            </Text>
          </Animated.View>
        )}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    alignItems: 'center',
  },
  toast: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two + Spacing.one,
    paddingHorizontal: Spacing.three,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 6,
  },
  text: {
    fontFamily: FontFamily.medium,
    fontSize: 15,
    lineHeight: 20,
  },
});
