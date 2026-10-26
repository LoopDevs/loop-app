import '@/global.css';

import { Platform } from 'react-native';
import { Easing } from 'react-native-reanimated';

export const Brand = {
  royal: '#1C3FAE',
  navy: '#0A1640',
  onRoyal: '#FFFFFF',
  onRoyalMuted: '#C9D4FA',
  pillGround: '#E3EAFF',
  pillText: '#1C3FAE',
  scrim: 'rgba(10, 22, 64, 0.5)',
} as const;

export const Colors = {
  light: {
    text: '#0B1530',
    background: '#EEF1F8',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E3EAFF',
    textSecondary: '#545E78',
    border: '#D5DBEA',
    accent: '#1C3FAE',
    onAccent: '#FFFFFF',
    danger: '#B42318',
    success: '#11734B',
  },
  dark: {
    text: '#F2F4FA',
    background: '#0A0F1F',
    backgroundElement: '#141B30',
    backgroundSelected: '#1F2A52',
    textSecondary: '#A3ACC4',
    border: '#27304A',
    accent: '#8FA6FF',
    onAccent: '#0A1640',
    danger: '#FF8A80',
    success: '#5DD6A0',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const FontFamily = {
  regular: 'FiraSans-Regular',
  medium: 'FiraSans-Medium',
  semibold: 'FiraSans-SemiBold',
  bold: 'FiraSans-Bold',
} as const;

export const FontAssets = {
  [FontFamily.regular]: require('@/assets/fonts/FiraSans-Regular.ttf'),
  [FontFamily.medium]: require('@/assets/fonts/FiraSans-Medium.ttf'),
  [FontFamily.semibold]: require('@/assets/fonts/FiraSans-SemiBold.ttf'),
  [FontFamily.bold]: require('@/assets/fonts/FiraSans-Bold.ttf'),
};

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
  tile: 2,
  control: 4,
  pill: 999,
} as const;

export const Motion = {
  feedback: 120,
  state: 220,
  transition: 360,
  exit: 160,
  stagger: 45,
  pressScale: 0.97,
  easeOut: Easing.out(Easing.exp),
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

export const Layout = {
  wideMinWidth: 960,
  pageMaxWidth: 1240,
  narrowGutter: Spacing.three,
  wideGutter: Spacing.five,
  headerHeight: 72,
  formMaxWidth: 420,
  sheetWidth: 440,
} as const;
