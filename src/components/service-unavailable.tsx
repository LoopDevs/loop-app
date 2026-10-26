import { useCallback } from 'react';

import { Button } from '@/components/form';
import { RoyalScreen } from '@/components/royal-screen';
import { ctx, CtxError } from '@/ctx/client';
import {
  blockingServiceState,
  hasRecovered,
  serviceStateMessages,
  type BlockingServiceState,
  type RecoveryChecks,
} from '@/ctx/service-state';
import { useAppRefresh } from '@/hooks/use-app-refresh';
import { useBusyAction } from '@/hooks/use-busy-action';

const stillUnavailableMessage = 'Still unavailable. Try again later.';

type Props = {
  state: BlockingServiceState;
  onRecovered: () => void;
};

export function ServiceUnavailable({ state, onRecovered }: Props) {
  const { busy, message, setMessage, run } = useBusyAction();

  const tryAgain = useCallback(
    () =>
      run(async () => {
        if (await hasRecovered(state, recoveryChecks)) {
          onRecovered();
          return;
        }
        setMessage(stillUnavailableMessage);
      }),
    [run, setMessage, state, onRecovered],
  );
  useAppRefresh(tryAgain);

  return (
    <RoyalScreen title={serviceStateMessages[state]} message={message}>
      <Button label="Try again" variant="onRoyal" onPress={tryAgain} disabled={busy} />
    </RoyalScreen>
  );
}

const recoveryChecks: RecoveryChecks = {
  hasSession: () => ctx.hasSession(),
  maintenance: async () => (await ctx.status()).maintenance,
  readProfile: () => ctx.me(),
  isBlocking: (error) => error instanceof CtxError && blockingServiceState(error.errorName()) !== null,
};
