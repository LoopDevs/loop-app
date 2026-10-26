import { useCallback, useState } from 'react';

import { ctx } from '@/ctx/client';
import { Rates } from '@/ctx/rates';
import { errorMessage } from '@/hooks/use-busy-action';
import { network } from '@/stellar/network';
import { Holdings } from '@/wallet/holdings';
import type { SmartWallet } from '@/wallet/smart-wallet';

export type HoldingsView = {
  holdings: Holdings;
  stable: string | null;
  problem: string;
};

export function useHoldings(wallet: SmartWallet | null) {
  const [view, setView] = useState<HoldingsView | null>(null);

  const refresh = useCallback(async () => {
    if (!wallet) {
      setView(null);
      return;
    }
    const [balances, account, profile, rates] = await Promise.all([
      wallet.balances(),
      ctx
        .account()
        .then(Holdings.onTheWayFrom)
        .catch((error: unknown) => new Error(errorMessage(error))),
      ctx.me().catch((error: unknown) => new Error(errorMessage(error))),
      Rates.fetch(network.tokens.map((token) => token.currency)),
    ]);
    const failure = [account, profile].find((result) => result instanceof Error);
    setView({
      holdings: new Holdings(balances, account instanceof Error ? null : account, rates),
      stable: profile instanceof Error ? null : (profile.stableCurrency ?? Rates.usd),
      problem: failure ? `Couldn't load your cashback: ${failure.message}` : '',
    });
  }, [wallet]);

  return { view, refresh };
}
