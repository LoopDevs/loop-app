import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Wordmark } from '@/components/wordmark';
import { Brand, FontFamily, MaxContentWidth, Spacing } from '@/constants/theme';

type RoyalScreenProps = {
  title: string;
  detail?: string;
  message?: string;
  children: ReactNode;
};

export function RoyalScreen({ title, detail, message, children }: RoyalScreenProps) {
  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} accessibilityLiveRegion="polite">
          <Wordmark height={32} />
          <View style={styles.copy}>
            <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
              {title}
            </Text>
            {detail ? (
              <Text style={styles.detail} maxFontSizeMultiplier={1.6}>
                {detail}
              </Text>
            ) : null}
          </View>
          {children}
          {message ? (
            <Text style={styles.detail} selectable maxFontSizeMultiplier={1.6}>
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
    backgroundColor: Brand.royal,
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
    color: Brand.onRoyal,
    fontFamily: FontFamily.bold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.6,
  },
  detail: {
    color: Brand.onRoyalMuted,
    fontFamily: FontFamily.regular,
    fontSize: 16,
    lineHeight: 22,
  },
});
