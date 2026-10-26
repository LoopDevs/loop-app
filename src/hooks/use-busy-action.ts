import { useCallback, useState } from 'react';

import { haptics } from '@/native/haptics';

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useBusyAction() {
  const [inFlight, setInFlight] = useState(0);
  const [message, setMessage] = useState('');

  const run = useCallback(async (action: () => Promise<void>) => {
    setInFlight((count) => count + 1);
    setMessage('');
    try {
      await action();
    } catch (error) {
      haptics.error();
      setMessage(errorMessage(error));
    } finally {
      setInFlight((count) => count - 1);
    }
  }, []);

  return { busy: inFlight > 0, message, setMessage, run };
}
