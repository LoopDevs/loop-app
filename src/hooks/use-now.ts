import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
      const timer = setInterval(() => setNow(Date.now()), intervalMs);
      return () => clearInterval(timer);
    }, [intervalMs]),
  );
  return now;
}
