import { useCallback, useRef, useState } from 'react';

import type { Account } from '@/ctx/account';
import { ctx } from '@/ctx/client';
import { Rates } from '@/ctx/rates';
import { errorMessage } from '@/hooks/use-busy-action';
import { network, offeredCurrencies } from '@/stellar/network';
import { Holdings } from '@/wallet/holdings';
import type { SmartWallet } from '@/wallet/smart-wallet';

const pricedCurrencies = new Set<string>([
  ...network.tokens.map((token) => token.currency),
  ...offeredCurrencies,
]);

const paidElsewhereProblem = 'Some of your cashback is going somewhere other than this balance. Contact support.';

export type HoldingsView = {
  holdings: Holdings;
  account: Account | null;
  stable: string | null;
  problem: string;
};

export function useHoldings(wallet: SmartWallet | null) {
  const [loaded, setLoaded] = useState<{ address: string; view: HoldingsView } | null>(null);
  const latestRequest = useRef(0);
  const view = wallet && loaded?.address === wallet.address ? loaded.view : null;

  const refresh = useCallback(async () => {
    const request = ++latestRequest.current;
    if (!wallet) {
      setLoaded(null);
      return;
    }
    const [balances, fetchedAccount, profile, rates] = await Promise.all([
      wallet.balances(),
      ctx.account().catch((error: unknown) => new Error(errorMessage(error))),
      ctx.me().catch((error: unknown) => new Error(errorMessage(error))),
      Rates.fetch([...pricedCurrencies]),
    ]);
    const account =
      fetchedAccount instanceof Error
        ? fetchedAccount
        : await fetchedAccount
            .withoutLandedPayouts(wallet.address, (txHash) => wallet.transactionLanded(txHash))
            .catch((error: unknown) => new Error(errorMessage(error)));
    if (request !== latestRequest.current) {
      return;
    }
    const failure = [account, profile].find((result) => result instanceof Error);
    const loadedAccount = account instanceof Error ? null : account;
    const loadedProfile = profile instanceof Error ? null : profile;
    const paidElsewhere = loadedAccount !== null && Holdings.paidElsewhere(loadedAccount, wallet.address);
    setLoaded({
      address: wallet.address,
      view: {
        holdings: new Holdings(
          balances,
          loadedAccount && loadedProfile
            ? Holdings.onTheWayFrom(loadedAccount, wallet.address, loadedProfile)
            : null,
          rates,
        ),
        account: loadedAccount,
        stable: loadedProfile ? shownCurrency(loadedProfile.stableCurrency) : null,
        problem: failure
          ? `Couldn't load your cashback: ${failure.message}`
          : paidElsewhere
            ? paidElsewhereProblem
            : '',
      },
    });
  }, [wallet]);

  return { view, refresh };
}

function shownCurrency(stableCurrency: string | undefined): string {
  return stableCurrency && offeredCurrencies.has(stableCurrency) ? stableCurrency : Rates.usd;
}
