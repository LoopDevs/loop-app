import { useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button, Notice } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Layout, Motion, Spacing } from '@/constants/theme';
import type { SmartWallet } from '@/wallet/smart-wallet';

const setupFailed = "Couldn't set up Loop on this device. Please try again.";

export function AddDevice({ wallet, onAdded }: { wallet: SmartWallet; onAdded: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const addThisDevice = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await wallet.addThisDevice();
      await onAdded();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Animated.View entering={FadeIn.duration(Motion.state)} style={styles.sheet}>
      <ThemedText type="subtitle">Use Loop on this device</ThemedText>
      <ThemedText themeColor="textSecondary">
        You&apos;ll confirm it&apos;s you with Face ID, your fingerprint or your screen lock.
      </ThemedText>
      <Button
        label={busy ? 'Setting up…' : 'Continue'}
        variant="primary"
        onPress={addThisDevice}
        disabled={busy}
      />
      {failed && <Notice message={setupFailed} />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    gap: Spacing.three,
    maxWidth: Layout.formMaxWidth,
  },
});
