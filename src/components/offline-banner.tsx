import { useNetInfo } from '@react-native-community/netinfo';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export function OfflineBanner() {
  const { isConnected } = useNetInfo();
  if (isConnected !== false) {
    return null;
  }
  return (
    <SafeAreaView edges={['top']} pointerEvents="none" style={styles.host}>
      <ThemedView type="backgroundElement" style={styles.banner} accessibilityLiveRegion="polite">
        <ThemedText type="small">You&apos;re offline. Loop will refresh when you&apos;re back online.</ThemedText>
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
