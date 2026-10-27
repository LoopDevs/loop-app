import 'react-native-get-random-values';

import { ErrorBoundary } from '@sentry/react-native';
import { useFonts } from 'expo-font';
import { ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppLockProvider } from '@/components/app-lock';
import AppTabs from '@/components/app-tabs';
import { CrashFallback } from '@/components/crash-fallback';
import { OfflineBanner } from '@/components/offline-banner';
import { ServiceUnavailable } from '@/components/service-unavailable';
import { SignInProvider } from '@/components/sign-in';
import { ToastProvider } from '@/components/toast';
import { FontAssets, NavigationTheme } from '@/constants/theme';
import { ctx } from '@/ctx/client';
import type { BlockingServiceState } from '@/ctx/service-state';
import { useAppRefreshTriggers } from '@/hooks/use-app-refresh';
import { MarketProvider } from '@/hooks/use-market';
import { useAppSwitcherProtection } from '@/native/screen-privacy';
import { errorReporting } from '@/ops/error-reporting';
import { useUpdateChecks } from '@/updates/use-update-checks';

errorReporting.init();
SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function TabLayout() {
  const [blocked, setBlocked] = useState<BlockingServiceState | null>(null);
  const [fontsLoaded, fontError] = useFonts(FontAssets);
  const fontsSettled = fontsLoaded || fontError !== null;
  useAppRefreshTriggers();
  useAppSwitcherProtection();
  useUpdateChecks();
  useEffect(() => ctx.onServiceState(setBlocked), []);
  useEffect(() => {
    if (fontsSettled) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsSettled]);
  if (!fontsSettled) {
    return null;
  }
  return (
    <ThemeProvider value={NavigationTheme}>
      <StatusBar style="dark" />
      <ErrorBoundary fallback={({ error, resetError }) => <CrashFallback error={error} onRetry={resetError} />}>
        <AppLockProvider>
          <ToastProvider>
            <MarketProvider>
              <SignInProvider>
                <View
                  style={styles.fill}
                  aria-hidden={blocked !== null}
                  accessibilityElementsHidden={blocked !== null}
                  importantForAccessibility={blocked ? 'no-hide-descendants' : 'auto'}>
                  <AppTabs />
                </View>
                {blocked && (
                  <View style={StyleSheet.absoluteFill}>
                    <ServiceUnavailable state={blocked} onRecovered={() => setBlocked(null)} />
                  </View>
                )}
                <OfflineBanner />
              </SignInProvider>
            </MarketProvider>
          </ToastProvider>
        </AppLockProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
