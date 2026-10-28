import '@/global.css';

import { DefaultTheme } from 'expo-router';
import { Platform } from 'react-native';
import { Easing } from 'react-native-reanimated';

import { SymbolFont } from '@/components/symbol-codepoints';

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
    accent: '#2F6BFF',
    accentPressed: '#1A56DB',
    accentSoft: '#EAF0FF',
    onAccent: '#FFFFFF',
    danger: '#B42318',
    success: '#11734B',
    chrome: 'rgba(255, 255, 255, 0.92)',
    scrim: 'rgba(15, 27, 45, 0.32)',
    inverse: '#0F1B2D',
    onInverse: '#FFFFFF',
    onInverseMuted: '#C3CAD5',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light;

export const NavigationTheme: typeof DefaultTheme = {
  ...DefaultTheme,
  colors: {
    primary: Colors.light.accent,
    background: Colors.light.background,
    card: Colors.light.background,
    text: Colors.light.text,
    border: Colors.light.border,
    notification: Colors.light.danger,
  },
};

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

export const Fonts = {
  mono: Platform.select({
    ios: 'ui-monospace',
    default: 'monospace',
    web: 'var(--font-mono)',
  }),
};

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
  small: 8,
  medium: 14,
  large: 22,
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
  sheet: {
    boxShadow: '0 16px 40px rgba(15, 27, 45, 0.24)',
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

export const PageMetrics = {
  wideMinWidth: 960,
  pageMaxWidth: 1240,
  narrowGutter: 16,
  wideGutter: 32,
} as const;

export const Layout = {
  ...PageMetrics,
  headerHeight: 72,
  formMaxWidth: 420,
  sheetWidth: 440,
} as const;
