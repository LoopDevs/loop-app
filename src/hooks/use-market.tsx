import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { Market } from '@/ctx/market';

type MarketState = {
  country: string;
  choose: (country: string) => void;
};

const MarketContext = createContext<MarketState | null>(null);

function deviceLocales(): (string | undefined)[] {
  const browser = globalThis.navigator?.languages ?? [globalThis.navigator?.language];
  return [...browser, Intl.DateTimeFormat().resolvedOptions().locale];
}

export function MarketProvider({ children }: { children: ReactNode }) {
  const [country, setCountry] = useState(() => Market.resolve(null, deviceLocales()));

  useEffect(() => {
    let current = true;
    AsyncStorage.getItem(Market.storageKey)
      .catch(() => null)
      .then((stored) => {
        if (current && Market.supports(stored)) {
          setCountry(stored);
        }
      });
    return () => {
      current = false;
    };
  }, []);

  const choose = useCallback((chosen: string) => {
    if (!Market.supports(chosen)) {
      return;
    }
    setCountry(chosen);
    AsyncStorage.setItem(Market.storageKey, chosen).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ country, choose }), [country, choose]);
  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarket(): MarketState {
  const market = useContext(MarketContext);
  if (!market) {
    throw new Error('useMarket needs a MarketProvider');
  }
  return market;
}
