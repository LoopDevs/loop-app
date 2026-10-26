import { StyleSheet, Text, View } from 'react-native';

import { FontFamily, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function PreviewBadge() {
  const theme = useTheme();
  return (
    <View
      style={[styles.badge, { backgroundColor: theme.backgroundSelected }]}
      accessible
      accessibilityLabel="Preview, nothing is sent">
      <Text style={[styles.label, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.3}>
        Preview
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
  },
  label: {
    fontFamily: FontFamily.semibold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.2,
  },
});
