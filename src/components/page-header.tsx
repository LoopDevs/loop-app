import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand, FontFamily, MaxContentWidth, Spacing } from '@/constants/theme';

type PageHeaderProps = {
  title: string;
  detail?: string;
  accessory?: ReactNode;
  children?: ReactNode;
};

export function PageHeader({ title, detail, accessory, children }: PageHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.panel, { paddingTop: insets.top + Spacing.three }]}>
      <View style={styles.inner}>
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
              {title}
            </Text>
            {detail ? (
              <Text style={styles.detail} maxFontSizeMultiplier={1.6}>
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
  panel: {
    backgroundColor: Brand.royal,
    paddingBottom: Spacing.four,
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
    color: Brand.onRoyal,
    fontFamily: FontFamily.bold,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.8,
  },
  detail: {
    color: Brand.onRoyalMuted,
    fontFamily: FontFamily.medium,
    fontSize: 15,
    lineHeight: 20,
  },
});
