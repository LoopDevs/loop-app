import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button, Notice } from '@/components/ui/form';
import { ThemedText } from '@/components/ui/themed-text';
import { Layout, Motion, Spacing } from '@/constants/theme';
import { errorMessage } from '@/hooks/use-busy-action';

type WalletStepProps = {
  title: string;
  body: string;
  label: string;
  busyLabel: string;
  run: (signal: AbortSignal) => Promise<void>;
  onDone: () => Promise<void>;
};

export function WalletStep({ title, body, label, busyLabel, run, onDone }: WalletStepProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  const unmounted = useRef(new AbortController());

  useEffect(() => {
    const controller = new AbortController();
    unmounted.current = controller;
    return () => controller.abort();
  }, []);

  const start = async () => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    try {
      await run(unmounted.current.signal);
      await onDone();
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
      <ThemedText type="subtitle">{title}</ThemedText>
      <ThemedText themeColor="textSecondary">{body}</ThemedText>
      <Button label={busy ? busyLabel : label} variant="primary" onPress={start} disabled={busy} />
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
