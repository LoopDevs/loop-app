import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';

type SplitLayoutProps = {
  children: ReactNode;
  aside?: ReactNode;
  asideWidth?: number;
  asideSide?: 'start' | 'end';
};

export function SplitLayout({ children, aside, asideWidth = 340, asideSide = 'end' }: SplitLayoutProps) {
  const asideColumn = aside ? <View style={[styles.aside, { width: asideWidth }]}>{aside}</View> : null;
  return (
    <View style={styles.split}>
      {asideSide === 'start' && asideColumn}
      <View style={styles.main}>{children}</View>
      {asideSide === 'end' && asideColumn}
    </View>
  );
}

const styles = StyleSheet.create({
  split: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.five,
  },
  main: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.three,
  },
  aside: {
    flexShrink: 0,
    gap: Spacing.three,
  },
});
