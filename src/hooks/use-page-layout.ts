import { Platform, useWindowDimensions } from 'react-native';

import { useHydrated } from '@/hooks/use-hydrated';
import { PageLayout } from '@/hooks/page-layout';

export function usePageLayout() {
  const hydrated = useHydrated();
  const { width } = useWindowDimensions();
  if (Platform.OS === 'web' && !hydrated) {
    return PageLayout.prerendered();
  }
  return PageLayout.forWidth(width, Platform.OS === 'web');
}
