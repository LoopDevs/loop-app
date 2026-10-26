import { useNetInfo } from '@react-native-community/netinfo';
import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

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
      <ThemedView type="backgroundElement" style={styles.banner} accessibilityLiveRegion="polite">
        <ThemedText type="small">{offlineMessage}</ThemedText>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  banner: {
    marginHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    alignItems: 'center',
  },
});
