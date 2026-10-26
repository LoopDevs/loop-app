import { StyleSheet, Text, type TextProps } from 'react-native';

import { FontFamily, Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'title'
    | 'heading'
    | 'small'
    | 'smallBold'
    | 'caption'
    | 'subtitle'
    | 'link'
    | 'linkPrimary'
    | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const linkColor = type === 'linkPrimary' ? { color: theme.accent } : null;

  return (
    <Text
      maxFontSizeMultiplier={1.6}
      style={[{ color: theme[themeColor ?? 'text'] }, styles[type], linkColor, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  caption: {
    fontFamily: FontFamily.medium,
    fontSize: 12,
    lineHeight: 16,
  },
  small: {
    fontFamily: FontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  smallBold: {
    fontFamily: FontFamily.semibold,
    fontSize: 14,
    lineHeight: 20,
  },
  default: {
    fontFamily: FontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
  },
  heading: {
    fontFamily: FontFamily.semibold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontFamily: FontFamily.semibold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.4,
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -0.8,
  },
  link: {
    fontFamily: FontFamily.medium,
    lineHeight: 24,
    fontSize: 14,
  },
  linkPrimary: {
    fontFamily: FontFamily.semibold,
    lineHeight: 24,
    fontSize: 14,
  },
  code: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    letterSpacing: 0.5,
  },
});
