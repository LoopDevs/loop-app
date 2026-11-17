import { useNetInfo } from '@react-native-community/netinfo';
import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontFamily, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const offlineMessage = "You're offline. Loop will refresh when you're back online.";

export function OfflineBanner() {
  const { isConnected } = useNetInfo();
  const theme = useTheme();
  const offline = isConnected === false;
  useEffect(() => {
    if (offline) {
      AccessibilityInfo.announceForAccessibility(offlineMessage);
    }
  }, [offline]);
  return (
    <>
      {Platform.OS === 'web' && (
        <View role="status" aria-live="polite" style={styles.announcer}>
          {offline && <Text>{offlineMessage}</Text>}
        </View>
      )}
      {offline && (
        <SafeAreaView edges={['top']} pointerEvents="none" style={styles.host}>
          <View
            style={[styles.banner, { backgroundColor: theme.inverse, shadowColor: theme.inverse }]}
            accessibilityLiveRegion="polite">
            <SymbolView
              name={{ ios: 'wifi.slash', android: 'wifi_off', web: 'wifi_off' }}
              size={18}
              tintColor={theme.onInverseMuted}
            />
            <Text style={[styles.text, { color: theme.onInverse }]} maxFontSizeMultiplier={1.6}>
              {offlineMessage}
            </Text>
          </View>
        </SafeAreaView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  announcer: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0,
  },
  host: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.three,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    marginTop: Spacing.two,
    paddingVertical: Spacing.two + Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 6,
  },
  text: {
    flex: 1,
    fontFamily: FontFamily.medium,
    fontSize: 15,
    lineHeight: 20,
  },
});
