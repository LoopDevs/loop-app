import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { ctx, CtxError } from '@/ctx/client';
import {
  blockingServiceState,
  hasRecovered,
  serviceStateMessages,
  type BlockingServiceState,
  type RecoveryChecks,
} from '@/ctx/service-state';
import { useBusyAction } from '@/hooks/use-busy-action';

const stillUnavailableMessage = 'Still unavailable. Try again later.';

type Props = {
  state: BlockingServiceState;
  onRecovered: () => void;
};

export function ServiceUnavailable({ state, onRecovered }: Props) {
  const { busy, message, setMessage, run } = useBusyAction();

  const tryAgain = () =>
    run(async () => {
      if (await hasRecovered(state, recoveryChecks)) {
        onRecovered();
        return;
      }
      setMessage(stillUnavailableMessage);
    });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} accessibilityLiveRegion="polite">
          <ThemedText type="subtitle">{serviceStateMessages[state]}</ThemedText>
          <Button label="Try again" onPress={tryAgain} disabled={busy} />
          {message !== '' && (
            <ThemedText type="small" selectable>
              {message}
            </ThemedText>
          )}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const recoveryChecks: RecoveryChecks = {
  hasSession: () => ctx.hasSession(),
  maintenance: async () => (await ctx.status()).maintenance,
  readProfile: () => ctx.me(),
  isBlocking: (error) => error instanceof CtxError && blockingServiceState(error.errorName()) !== null,
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
});
