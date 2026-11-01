import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useOnSignIn } from '@/components/sign-in';
import { useAccountChanges } from '@/hooks/use-account-changes';
import { useAppRefresh } from '@/hooks/use-app-refresh';
import { errorMessage } from '@/hooks/use-busy-action';
import { useHoldings } from '@/hooks/use-holdings';
import { useSessionOwner } from '@/hooks/use-session-owner';
import { errorReporting } from '@/ops/error-reporting';
import { SmartWallet, WalletBlocked } from '@/wallet/smart-wallet';

export type WalletState = 'loading' | 'signed-out' | 'setup' | 'ready' | 'blocked' | 'failed';

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
      const next = await SmartWallet.load();
      loaded.current = next;
      setWallet(next);
      setState(next ? 'ready' : 'setup');
    } catch (error) {
      if (error instanceof WalletBlocked) {
        loaded.current = null;
        setWallet(null);
        setProblem(error.message);
        setState('blocked');
        return;
      }
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
  useAccountChanges(refresh, wallet !== null);

  return { state, wallet, view, refresh, reload: load, problem };
}
