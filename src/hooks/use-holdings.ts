import { useCallback, useRef, useState } from 'react';

import type { Account } from '@/ctx/account';
import { ctx } from '@/ctx/client';
import { Rates } from '@/ctx/rates';
import { errorMessage } from '@/hooks/use-busy-action';
import { network, offeredCurrencies } from '@/stellar/network';
import { Holdings } from '@/wallet/holdings';
import type { SmartWallet } from '@/wallet/smart-wallet';

export type HoldingsView = {
  holdings: Holdings;
  account: Account | null;
  stable: string | null;
  problem: string;
};

export function useHoldings(wallet: SmartWallet | null) {
  const [view, setView] = useState<HoldingsView | null>(null);
  const latestRequest = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++latestRequest.current;
    if (!wallet) {
      setView(null);
      return;
    }
    const [balances, account, profile, rates] = await Promise.all([
      wallet.balances(),
      ctx.account().catch((error: unknown) => new Error(errorMessage(error))),
      ctx.me().catch((error: unknown) => new Error(errorMessage(error))),
      Rates.fetch(network.tokens.map((token) => token.currency)),
    ]);
    if (request !== latestRequest.current) {
      return;
    }
    const failure = [account, profile].find((result) => result instanceof Error);
    const loadedAccount = account instanceof Error ? null : account;
    setView({
      holdings: new Holdings(
        balances,
        loadedAccount ? Holdings.onTheWayFrom(loadedAccount, wallet.address) : null,
        rates,
      ),
      account: loadedAccount,
      stable: profile instanceof Error ? null : shownCurrency(profile.stableCurrency),
      problem: failure ? `Couldn't load your cashback: ${failure.message}` : '',
    });
  }, [wallet]);

  return { view, refresh };
}

function shownCurrency(stableCurrency: string | undefined): string {
  return stableCurrency && offeredCurrencies.has(stableCurrency) ? stableCurrency : Rates.usd;
}
