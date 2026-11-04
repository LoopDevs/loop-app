import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useOnSignIn } from '@/components/sign-in';
import { cachedMerchant, loadMerchant } from '@/components/storefront';
import { BankPayment } from '@/ctx/bank-payment';
import { ctx, type GiftCard } from '@/ctx/client';
import { dismissedOrders } from '@/ctx/dismissed-orders';
import type { Merchant } from '@/ctx/merchant';
import type { Profile } from '@/ctx/profile';
import { useBusyAction } from '@/hooks/use-busy-action';
import { useSessionOwner } from '@/hooks/use-session-owner';
import { SmartWallet } from '@/wallet/smart-wallet';

export function useMerchantAccount(slug: string, { withActiveOrder = false, walletOnlyWithoutBank = false } = {}) {
  const { busy, message, load: track } = useBusyAction();
  const [merchant, setMerchant] = useState<Merchant | null>(() => cachedMerchant(slug));
  const [wallet, setWallet] = useState<SmartWallet | null>(null);
  const [walletChecked, setWalletChecked] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [activeOrder, setActiveOrder] = useState<GiftCard | null>(null);
  const loadedSlug = useRef<string | undefined>(undefined);
  const readSession = useSessionOwner();

  const load = useCallback(
    () =>
      track(async () => {
        if (loadedSlug.current !== slug) {
          loadedSlug.current = slug;
          setMerchant(cachedMerchant(slug));
          setSignedIn(null);
          setActiveOrder(null);
        }
        const merchantLoad = loadMerchant(slug);
        void merchantLoad.then(setMerchant, () => undefined);
        const { userId, changed } = await readSession();
        if (changed) {
          setWallet(null);
          setWalletChecked(false);
          setProfile(null);
          setSignedIn(null);
          setActiveOrder(null);
        }
        if (userId === null) {
          setSignedIn(false);
          await merchantLoad;
          return;
        }
        const profileLoad = ctx.me().then((loaded) => {
          setProfile(loaded);
          setSignedIn(true);
          return loaded;
        });
        const loadWallet = () => SmartWallet.load().catch(SmartWallet.unlessBlocked);
        const walletLoad = (
          walletOnlyWithoutBank
            ? Promise.all([merchantLoad, profileLoad]).then(([loadedMerchant, loadedProfile]) =>
                BankPayment.offered(loadedMerchant.currency, loadedProfile) ? null : loadWallet(),
              )
            : loadWallet()
        ).then((loaded) => {
          setWallet((current) => (loaded?.sameAs(current) ? current : loaded));
          setWalletChecked(true);
        });
        const orderLoad = withActiveOrder
          ? merchantLoad
              .then((loaded) => dismissedOrders.activeOrder(loaded.id).catch(() => null))
              .then(setActiveOrder)
          : null;
        await Promise.all([merchantLoad, profileLoad, walletLoad, orderLoad]);
      }),
    [track, slug, readSession, withActiveOrder, walletOnlyWithoutBank],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useOnSignIn(load);

  return {
    merchant,
    wallet,
    walletChecked,
    profile,
    signedIn,
    activeOrder,
    busy,
    message,
    load,
    setProfile,
  };
}
