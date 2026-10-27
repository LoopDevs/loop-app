import NetInfo from '@react-native-community/netinfo';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { ForegroundRefresh } from '@/hooks/foreground-refresh';

type Listener = () => void;

const listeners = new Set<Listener>();

export const appRefresh = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  emit(): void {
    listeners.forEach((listener) => listener());
  },
};

export function useAppRefresh(listener: Listener): void {
  useEffect(() => appRefresh.subscribe(listener), [listener]);
}

export function useAppRefreshTriggers(): void {
  const foreground = useRef(new ForegroundRefresh());
  const connected = useRef<boolean | null>(null);

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener('change', (next) => {
      if (foreground.current.shouldRefresh(next, Date.now())) {
        appRefresh.emit();
      }
    });
    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      const reconnected = connected.current === false && state.isConnected === true;
      connected.current = state.isConnected;
      if (reconnected && foreground.current.shouldRefreshOnReconnect(Date.now())) {
        appRefresh.emit();
      }
    });
    return () => {
      appStateSubscription.remove();
      unsubscribeNetInfo();
    };
  }, []);
}
