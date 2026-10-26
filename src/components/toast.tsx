import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, useReducedMotion } from 'react-native-reanimated';

import { BottomTabInset, Brand, FontFamily, Motion, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const toastLifetimeMs = 2500;

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

  const show = useCallback((text: string) => {
    setToast((current) => ({ id: (current?.id ?? 0) + 1, text }));
    AccessibilityInfo.announceForAccessibility(text);
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = setTimeout(() => setToast(null), toastLifetimeMs);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <View pointerEvents="none" style={styles.host}>
        {toast && (
          <Animated.View
            key={toast.id}
            entering={reduceMotion ? undefined : FadeInDown.duration(Motion.state).easing(Motion.easeOut)}
            exiting={reduceMotion ? undefined : FadeOut.duration(Motion.exit)}
            style={[styles.toast, { borderColor: theme.border }]}>
            <Text style={styles.text} maxFontSizeMultiplier={1.6}>
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
    bottom: BottomTabInset + Spacing.four,
    alignItems: 'center',
  },
  toast: {
    backgroundColor: Brand.navy,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.control,
    paddingVertical: Spacing.two + Spacing.one,
    paddingHorizontal: Spacing.three,
    shadowColor: Brand.navy,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 6,
  },
  text: {
    color: Brand.onRoyal,
    fontFamily: FontFamily.medium,
    fontSize: 15,
    lineHeight: 20,
  },
});
