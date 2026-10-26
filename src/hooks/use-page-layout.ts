import { Platform, useWindowDimensions } from 'react-native';

import { Layout } from '@/constants/theme';
import { useHydrated } from '@/hooks/use-hydrated';

const columnSteps = [
  { minWidth: 1180, columns: 6 },
  { minWidth: 960, columns: 5 },
  { minWidth: 720, columns: 4 },
  { minWidth: 520, columns: 3 },
] as const;

export function usePageLayout() {
  const hydrated = useHydrated();
  const { width: windowWidth } = useWindowDimensions();
  const width = hydrated ? windowWidth : 0;
  const wide = Platform.OS === 'web' && width >= Layout.wideMinWidth;
  const gutter = wide ? Layout.wideGutter : Layout.narrowGutter;
  const contentWidth = Math.min(width, Layout.pageMaxWidth) - gutter * 2;
  const columns = columnSteps.find((step) => contentWidth >= step.minWidth)?.columns ?? 2;
  return { wide, gutter, columns };
}
