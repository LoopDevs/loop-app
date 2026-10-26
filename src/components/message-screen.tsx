import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Wordmark } from '@/components/wordmark';
import { FontFamily, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type MessageScreenProps = {
  title: string;
  detail?: string;
  message?: string;
  children: ReactNode;
};

export function MessageScreen({ title, detail, message, children }: MessageScreenProps) {
  const theme = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <StatusBar style="auto" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} accessibilityLiveRegion="polite">
          <Wordmark height={28} />
          <View style={styles.copy}>
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
          {children}
          {message ? (
            <Text
              style={[styles.detail, { color: theme.textSecondary }]}
              selectable
              maxFontSizeMultiplier={1.6}>
              {message}
            </Text>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  copy: {
    gap: Spacing.two,
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.6,
  },
  detail: {
    fontFamily: FontFamily.regular,
    fontSize: 16,
    lineHeight: 22,
  },
});
