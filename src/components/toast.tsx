import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';

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
          <Animated.View key={toast.id} entering={FadeInDown} exiting={FadeOut}>
            <ThemedView type="backgroundElement" style={styles.toast}>
              <ThemedText type="small">{toast.text}</ThemedText>
            </ThemedView>
          </Animated.View>
        )}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: Spacing.four,
    right: Spacing.four,
    bottom: BottomTabInset + Spacing.four,
    alignItems: 'center',
  },
  toast: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
});
