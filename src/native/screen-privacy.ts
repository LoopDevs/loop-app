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
