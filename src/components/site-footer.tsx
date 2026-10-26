import { Link, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Wordmark } from '@/components/wordmark';
import { Layout, Spacing } from '@/constants/theme';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useTheme } from '@/hooks/use-theme';

type FooterLink = {
  label: string;
  path: Href & string;
};

type FooterColumn = {
  title: string;
  links: readonly FooterLink[];
};

const footerColumns: readonly FooterColumn[] = [
  {
    title: 'Company',
    links: [
      { label: 'About', path: '/about' },
      { label: 'Careers', path: '/careers' },
      { label: 'Press', path: '/press' },
      { label: 'Affiliates', path: '/affiliates' },
    ],
  },
  {
    title: 'Help',
    links: [
      { label: 'How it works', path: '/how-it-works' },
      { label: 'FAQ', path: '/faq' },
      { label: 'Support', path: '/support' },
      { label: 'Security', path: '/security' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms', path: '/terms' },
      { label: 'Privacy', path: '/privacy' },
      { label: 'Cookies', path: '/cookies' },
      { label: 'Accessibility', path: '/accessibility' },
      { label: 'Complaints', path: '/complaints' },
    ],
  },
];

const pitch = 'Buy gift cards from brands you love and get cashback you can spend or save.';

const smallPrint =
  'Gift cards are issued by the brands named on them and are subject to their terms. ' +
  'Brand names and logos belong to their owners and are used to identify the gift cards on sale. ' +
  'Loop is available in the US, UK, Canada and Europe.';

export function SiteFooter() {
  const theme = useTheme();
  if (Platform.OS !== 'web') {
    return null;
  }
  return (
    <View style={styles.placement}>
      <Animated.View
        entering={FadeIn}
        style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.backgroundSubtle }]}>
        <FooterWidth style={styles.inner}>
          <FooterColumns />
          <View style={[styles.rule, { backgroundColor: theme.border }]} />
          <View style={styles.bottom}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.smallPrint}>
              {smallPrint}
            </ThemedText>
            <Copyright />
          </View>
        </FooterWidth>
      </Animated.View>
    </View>
  );
}

function FooterColumns() {
  const { wide } = usePageLayout();
  return (
    <View style={[styles.top, wide && styles.topWide]}>
      <View style={styles.brand}>
        <Wordmark height={22} />
        <ThemedText type="small" themeColor="textSecondary">
          {pitch}
        </ThemedText>
      </View>
      <View style={[styles.columns, wide && styles.columnsWide]}>
        {footerColumns.map((column) => (
          <View key={column.title} style={styles.column} accessibilityRole="list">
            <ThemedText type="smallBold">{column.title}</ThemedText>
            {column.links.map((link) => (
              <Link key={link.path} href={link.path} style={styles.link}>
                <ThemedText type="small" themeColor="textSecondary">
                  {link.label}
                </ThemedText>
              </Link>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function Copyright() {
  return (
    <ThemedText type="caption" themeColor="textSecondary">
      © {new Date().getFullYear()} Loop
    </ThemedText>
  );
}

function FooterWidth({ children, style }: { children: ReactNode; style: object }) {
  const { gutter } = usePageLayout();
  return <View style={[styles.width, { paddingHorizontal: gutter }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  placement: {
    marginTop: 'auto',
    paddingTop: Spacing.five,
  },
  footer: {
    borderTopWidth: 1,
  },
  width: {
    width: '100%',
    maxWidth: Layout.pageMaxWidth,
    alignSelf: 'center',
  },
  inner: {
    paddingTop: Spacing.six,
    paddingBottom: Spacing.five,
    gap: Spacing.five,
  },
  top: {
    gap: Spacing.five,
  },
  topWide: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  brand: {
    gap: Spacing.three,
    maxWidth: 320,
  },
  columns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: Spacing.five,
    columnGap: Spacing.four,
  },
  columnsWide: {
    columnGap: Spacing.six,
  },
  column: {
    gap: Spacing.two,
    minWidth: 140,
  },
  link: {
    alignSelf: 'flex-start',
  },
  rule: {
    height: 1,
  },
  bottom: {
    gap: Spacing.three,
  },
  smallPrint: {
    maxWidth: 720,
    fontSize: 13,
    lineHeight: 19,
  },
});
