import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";

import { Market } from "@/ctx/market";

type MarketState = {
  country: string;
  resolved: boolean;
  choose: (country: string) => void;
};

const MarketContext = createContext<MarketState | null>(null);

function deviceLocales(): (string | undefined)[] {
  const browser = globalThis.navigator?.languages ?? [
    globalThis.navigator?.language,
  ];
  return [...browser, Intl.DateTimeFormat().resolvedOptions().locale];
}

const regionTimeoutMs = 1500;

async function locatedCountry(): Promise<string | null> {
  if (Platform.OS !== "web") {
    return null;
  }
  try {
    const response = await fetch("/api/region", {
      signal: AbortSignal.timeout(regionTimeoutMs),
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { country?: unknown };
    return typeof body.country === "string" ? body.country : null;
  } catch {
    return null;
  }
}

export function MarketProvider({ children }: { children: ReactNode }) {
  const [country, setCountry] = useState(() =>
    Platform.OS === "web"
      ? Market.fallback
      : Market.resolve(null, null, deviceLocales()),
  );
  const [resolved, setResolved] = useState(false);
  const chosenByUser = useRef(false);

  useEffect(() => {
    let current = true;
    const stored = AsyncStorage.getItem(Market.storageKey).catch(() => null);
    Promise.all([stored, locatedCountry()]).then(([chosen, located]) => {
      if (!current) {
        return;
      }
      if (!chosenByUser.current) {
        setCountry(Market.resolve(chosen, located, deviceLocales()));
      }
      setResolved(true);
    });
    return () => {
      current = false;
    };
  }, []);

  const choose = useCallback((chosen: string) => {
    if (!Market.supports(chosen)) {
      return;
    }
    chosenByUser.current = true;
    setCountry(chosen);
    setResolved(true);
    AsyncStorage.setItem(Market.storageKey, chosen).catch(() => undefined);
  }, []);

  const value = useMemo(
    () => ({ country, resolved, choose }),
    [country, resolved, choose],
  );
  return (
    <MarketContext.Provider value={value}>{children}</MarketContext.Provider>
  );
}

export function useMarket(): MarketState {
  const market = useContext(MarketContext);
  if (!market) {
    throw new Error("useMarket needs a MarketProvider");
  }
  return market;
}
