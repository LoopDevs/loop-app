import { useCallback, useState } from 'react';

import { haptics } from '@/native/haptics';

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useBusyAction() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (error) {
      haptics.error();
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, message, setMessage, run };
}
