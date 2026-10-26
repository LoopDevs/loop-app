import { useNetInfo } from '@react-native-community/netinfo';
import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Brand, FontFamily, MaxContentWidth, Radius, Spacing } from '@/constants/theme';

const offlineMessage = "You're offline. Loop will refresh when you're back online.";

export function OfflineBanner() {
  const { isConnected } = useNetInfo();
  const offline = isConnected === false;
  useEffect(() => {
    if (offline) {
      AccessibilityInfo.announceForAccessibility(offlineMessage);
    }
  }, [offline]);
  if (!offline) {
    return null;
  }
  return (
    <SafeAreaView edges={['top']} pointerEvents="none" style={styles.host}>
      <View style={styles.banner} accessibilityLiveRegion="polite">
        <SymbolView
          name={{ ios: 'wifi.slash', android: 'wifi_off', web: 'wifi_off' }}
          size={18}
          tintColor={Brand.onRoyalMuted}
        />
        <Text style={styles.text} maxFontSizeMultiplier={1.6}>
          {offlineMessage}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    borderRadius: Radius.control,
    backgroundColor: Brand.navy,
    shadowColor: Brand.navy,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 6,
  },
  text: {
    flex: 1,
    color: Brand.onRoyal,
    fontFamily: FontFamily.medium,
    fontSize: 15,
    lineHeight: 20,
  },
});
