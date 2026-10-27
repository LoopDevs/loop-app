import { useCallback, useRef, useState } from 'react';

import { haptics } from '@/native/haptics';
import { errorReporting } from '@/ops/error-reporting';

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useBusyAction() {
  const [inFlight, setInFlight] = useState(0);
  const [message, setMessage] = useState('');

  const track = useCallback(async (action: () => Promise<void>, context: string, onFailure: () => void) => {
    setInFlight((count) => count + 1);
    setMessage('');
    try {
      await action();
    } catch (error) {
      errorReporting.reportError(error, context);
      onFailure();
      setMessage(errorMessage(error));
    } finally {
      setInFlight((count) => count - 1);
    }
  }, []);

  const running = useRef(false);

  const run = useCallback(
    async (action: () => Promise<void>) => {
      if (running.current) {
        return;
      }
      running.current = true;
      try {
        await track(action, 'Action', () => haptics.error());
      } finally {
        running.current = false;
      }
    },
    [track],
  );

  const load = useCallback((action: () => Promise<void>) => track(action, 'Load', () => undefined), [track]);

  return { busy: inFlight > 0, message, setMessage, run, load };
}
