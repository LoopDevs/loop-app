import { useSyncExternalStore } from 'react';

function subscribeNever() {
  return () => undefined;
}

export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}
