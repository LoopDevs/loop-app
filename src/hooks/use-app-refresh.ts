import NetInfo from '@react-native-community/netinfo';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

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
  const appState = useRef(AppState.currentState);
  const connected = useRef<boolean | null>(null);

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener('change', (next) => {
      const returned = appState.current !== 'active' && next === 'active';
      appState.current = next;
      if (returned) {
        appRefresh.emit();
      }
    });
    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      const reconnected = connected.current === false && state.isConnected === true;
      connected.current = state.isConnected;
      if (reconnected) {
        appRefresh.emit();
      }
    });
    return () => {
      appStateSubscription.remove();
      unsubscribeNetInfo();
    };
  }, []);
}
