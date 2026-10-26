import * as ScreenCapture from 'expo-screen-capture';
import { useEffect, useId } from 'react';
import { Platform } from 'react-native';

export function useBlockScreenCapture(): void {
  ScreenCapture.usePreventScreenCapture(useId());
}

export function useAppSwitcherProtection(): void {
  useEffect(() => {
    if (Platform.OS === 'ios') {
      ScreenCapture.enableAppSwitcherProtectionAsync().catch(() => {});
    }
  }, []);
}

export function useRecentsProtection(enabled: boolean): void {
  const key = useId();
  useEffect(() => {
    if (Platform.OS !== 'android' || !enabled) {
      return;
    }
    ScreenCapture.preventScreenCaptureAsync(key).catch(() => {});
    return () => {
      ScreenCapture.allowScreenCaptureAsync(key).catch(() => {});
    };
  }, [enabled, key]);
}
