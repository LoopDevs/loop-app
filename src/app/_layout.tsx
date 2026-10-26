import 'react-native-get-random-values';

import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { OfflineBanner } from '@/components/offline-banner';
import { ToastProvider } from '@/components/toast';
import { useAppRefreshTriggers } from '@/hooks/use-app-refresh';
import { useAppSwitcherProtection } from '@/native/screen-privacy';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  useAppRefreshTriggers();
  useAppSwitcherProtection();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <ToastProvider>
        <AnimatedSplashOverlay />
        <AppTabs />
        <OfflineBanner />
      </ToastProvider>
    </ThemeProvider>
  );
}
