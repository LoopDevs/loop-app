import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button, Notice } from '@/components/ui/form';
import { ThemedText } from '@/components/ui/themed-text';
import { Layout, Motion, Spacing } from '@/constants/theme';
import { errorMessage } from '@/hooks/use-busy-action';
import type { SmartWallet } from '@/wallet/smart-wallet';

export function AddDevice({ wallet, onAdded }: { wallet: SmartWallet; onAdded: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  const unmounted = useRef(new AbortController());

  useEffect(() => {
    const controller = new AbortController();
    unmounted.current = controller;
    return () => controller.abort();
  }, []);

  const addThisDevice = async () => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    try {
      await wallet.addThisDevice(unmounted.current.signal);
      await onAdded();
    } catch (error) {
      if (!unmounted.current.signal.aborted) {
        setMessage(errorMessage(error));
      }
    } finally {
      inFlight.current = false;
      if (!unmounted.current.signal.aborted) {
        setBusy(false);
      }
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
      {message !== '' && <Notice message={message} />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    gap: Spacing.three,
    maxWidth: Layout.formMaxWidth,
  },
});
