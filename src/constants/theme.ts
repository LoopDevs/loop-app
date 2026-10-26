import '@/global.css';

import { Platform } from 'react-native';
import { Easing } from 'react-native-reanimated';

import { SymbolFont } from '@/components/symbol-codepoints';
import { PageMetrics } from '@/hooks/page-layout';

export const Colors = {
  light: {
    text: '#0F1B2D',
    background: '#FFFFFF',
    backgroundElement: '#FFFFFF',
    backgroundSubtle: '#F7F8FA',
    backgroundSelected: '#EEF1F5',
    textSecondary: '#5A6577',
    border: '#E6EAF0',
    borderStrong: '#D3DBE6',
    accent: '#1A56DB',
    accentSoft: '#EBF1FE',
    onAccent: '#FFFFFF',
    danger: '#B42318',
    success: '#11734B',
    chrome: 'rgba(255, 255, 255, 0.92)',
    inverse: '#0F1B2D',
    onInverse: '#FFFFFF',
    onInverseMuted: '#C3CAD5',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light;

export const FontFamily = {
  regular: 'FiraSans-Regular',
  medium: 'FiraSans-Medium',
  semibold: 'FiraSans-SemiBold',
  bold: 'FiraSans-Bold',
} as const;

const nativeFontAssets = {
  [FontFamily.regular]: require('@/assets/fonts/FiraSans-Regular.ttf'),
  [FontFamily.medium]: require('@/assets/fonts/FiraSans-Medium.ttf'),
  [FontFamily.semibold]: require('@/assets/fonts/FiraSans-SemiBold.ttf'),
  [FontFamily.bold]: require('@/assets/fonts/FiraSans-Bold.ttf'),
};

export const FontAssets =
  Platform.OS === 'web'
    ? {
        ...nativeFontAssets,
        [SymbolFont.family]: require('@/assets/fonts/MaterialSymbols-Loop.ttf'),
      }
    : nativeFontAssets;

export const Fonts = Platform.select({
  ios: {
    sans: FontFamily.regular,
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: FontFamily.regular,
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  tile: 12,
  control: 12,
  media: 18,
  card: 22,
  pill: 999,
} as const;

export const Elevation = {
  card: {
    boxShadow: '0 1px 2px rgba(15, 27, 45, 0.05), 0 4px 14px rgba(15, 27, 45, 0.06)',
  },
  raised: {
    boxShadow: '0 2px 4px rgba(15, 27, 45, 0.05), 0 8px 24px rgba(15, 27, 45, 0.1)',
  },
  badge: {
    boxShadow: '0 1px 2px rgba(15, 27, 45, 0.12), 0 2px 6px rgba(15, 27, 45, 0.1)',
  },
} as const;

export const Motion = {
  feedback: 120,
  state: 220,
  transition: 360,
  exit: 160,
  stagger: 45,
  pressScale: 0.97,
  easeOut: Easing.bezier(0.16, 1, 0.3, 1),
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const ScrollEndInset = Platform.OS === 'web' ? 0 : BottomTabInset + Spacing.five;
export const MaxContentWidth = 800;

export const Layout = {
  ...PageMetrics,
  headerHeight: 72,
  formMaxWidth: 420,
  sheetWidth: 440,
} as const;
