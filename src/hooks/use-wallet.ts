import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useOnSignIn } from '@/components/sign-in';
import { useAppRefresh } from '@/hooks/use-app-refresh';
import { errorMessage } from '@/hooks/use-busy-action';
import { useHoldings } from '@/hooks/use-holdings';
import { useSessionOwner } from '@/hooks/use-session-owner';
import { errorReporting } from '@/ops/error-reporting';
import { SmartWallet, UnlinkedDevice } from '@/wallet/smart-wallet';

export type WalletState = 'loading' | 'signed-out' | 'setup' | 'ready' | 'failed';

export function useWallet() {
  const [state, setState] = useState<WalletState>('loading');
  const [wallet, setWallet] = useState<SmartWallet | null>(null);
  const [problem, setProblem] = useState('');
  const { view, refresh } = useHoldings(wallet);
  const readSession = useSessionOwner();
  const loaded = useRef<SmartWallet | null>(null);

  const load = useCallback(async () => {
    try {
      const { userId, changed } = await readSession();
      if (!userId) {
        loaded.current = null;
        setWallet(null);
        setState('signed-out');
        return;
      }
      if (loaded.current && !changed) {
        await refresh();
        return;
      }
      const next = await SmartWallet.load().catch((error: unknown) => {
        if (error instanceof UnlinkedDevice) {
          return null;
        }
        throw error;
      });
      loaded.current = next;
      setWallet(next);
      setState(next ? 'ready' : 'setup');
    } catch (error) {
      errorReporting.reportError(error, 'Wallet load');
      setProblem(errorMessage(error));
      setState((current) => (current === 'ready' ? current : 'failed'));
    }
  }, [readSession, refresh]);

  useEffect(() => {
    if (wallet) {
      refresh().catch(() => undefined);
    }
  }, [wallet, refresh]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useAppRefresh(load);
  useOnSignIn(load);

  return { state, wallet, view, refresh, reload: load, problem };
}
