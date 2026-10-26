import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FontFamily, Layout, MaxContentWidth, Spacing } from '@/constants/theme';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useTheme } from '@/hooks/use-theme';

type PageHeaderProps = {
  title: string;
  detail?: string;
  accessory?: ReactNode;
  children?: ReactNode;
  belowNavigationHeader?: boolean;
  width?: 'content' | 'page';
};

export function PageHeader({
  title,
  detail,
  accessory,
  children,
  belowNavigationHeader = false,
  width = 'content',
}: PageHeaderProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { gutter } = usePageLayout();
  const topInset = belowNavigationHeader ? 0 : insets.top;
  const pageWidth = width === 'page' ? { maxWidth: Layout.pageMaxWidth, paddingHorizontal: gutter } : null;
  return (
    <View style={[styles.header, { paddingTop: topInset + Spacing.three }]}>
      <View style={[styles.inner, pageWidth]}>
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Text
              style={[styles.title, { color: theme.text }]}
              accessibilityRole="header"
              maxFontSizeMultiplier={1.4}>
              {title}
            </Text>
            {detail ? (
              <Text style={[styles.detail, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.6}>
                {detail}
              </Text>
            ) : null}
          </View>
          {accessory}
        </View>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: Spacing.three,
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  titleBlock: {
    flex: 1,
    gap: Spacing.one,
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.8,
  },
  detail: {
    fontFamily: FontFamily.medium,
    fontSize: 15,
    lineHeight: 20,
  },
});
