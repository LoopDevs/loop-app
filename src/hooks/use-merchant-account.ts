import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useOnSignIn } from '@/components/sign-in';
import { cachedMerchant, loadMerchant } from '@/components/storefront';
import { ctx, type GiftCard } from '@/ctx/client';
import { dismissedOrders } from '@/ctx/dismissed-orders';
import type { Merchant } from '@/ctx/merchant';
import type { Profile } from '@/ctx/profile';
import { useBusyAction } from '@/hooks/use-busy-action';
import { useSessionOwner } from '@/hooks/use-session-owner';
import { SmartWallet } from '@/wallet/smart-wallet';

export function useMerchantAccount(slug: string, { withActiveOrder = false } = {}) {
  const { busy, message, load: track } = useBusyAction();
  const [merchant, setMerchant] = useState<Merchant | null>(() => cachedMerchant(slug));
  const [wallet, setWallet] = useState<SmartWallet | null>(null);
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
        const walletLoad = readSession().then(async ({ userId, changed }) => {
          if (changed) {
            setWallet(null);
            setProfile(null);
            setSignedIn(null);
            setActiveOrder(null);
          }
          const isSignedIn = userId !== null;
          const [loadedWallet, loadedProfile] = isSignedIn
            ? await Promise.all([SmartWallet.load().catch(SmartWallet.unlessBlocked), ctx.me()])
            : [null, null];
          setWallet((current) => (loadedWallet?.sameAs(current) ? current : loadedWallet));
          setProfile(loadedProfile);
          setSignedIn(isSignedIn);
          return isSignedIn;
        });
        const [loaded, isSignedIn] = await Promise.all([merchantLoad, walletLoad]);
        if (withActiveOrder && isSignedIn) {
          setActiveOrder(await dismissedOrders.activeOrder(loaded.id).catch(() => null));
        }
      }),
    [track, slug, readSession, withActiveOrder],
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
    profile,
    signedIn,
    activeOrder,
    busy,
    message,
    load,
    setProfile,
  };
}
