import 'react-native-get-random-values';

import { ErrorBoundary } from '@sentry/react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { CrashFallback } from '@/components/crash-fallback';
import { OfflineBanner } from '@/components/offline-banner';
import { ServiceUnavailable } from '@/components/service-unavailable';
import { ToastProvider } from '@/components/toast';
import { ctx } from '@/ctx/client';
import type { BlockingServiceState } from '@/ctx/service-state';
import { useAppRefreshTriggers } from '@/hooks/use-app-refresh';
import { useAppSwitcherProtection } from '@/native/screen-privacy';
import { errorReporting } from '@/ops/error-reporting';

errorReporting.init();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [blocked, setBlocked] = useState<BlockingServiceState | null>(null);
  useAppRefreshTriggers();
  useAppSwitcherProtection();
  useEffect(() => ctx.onServiceState(setBlocked), []);
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <ErrorBoundary fallback={<CrashFallback />}>
        <ToastProvider>
          {blocked ? <ServiceUnavailable state={blocked} onRecovered={() => setBlocked(null)} /> : <AppTabs />}
          <OfflineBanner />
        </ToastProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
