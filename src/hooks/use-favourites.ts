import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useOnSignIn } from '@/components/sign-in';
import { useToast } from '@/components/ui/toast';
import { ctx } from '@/ctx/client';
import { FavouriteIds } from '@/session/favourite-ids';

export function useFavourites() {
  const toast = useToast();
  const [favourites, setFavourites] = useState(new FavouriteIds([]));
  const latest = useRef(favourites);
  const loadedFor = useRef<string | null>(null);
  const loading = useRef<Promise<void> | null>(null);
  const writes = useRef(0);

  const replace = useCallback((next: FavouriteIds) => {
    latest.current = next;
    setFavourites(next);
  }, []);

  const load = useCallback(() => {
    let current = true;
    const writesAtStart = writes.current;
    loading.current = ctx
      .userId()
      .then(async (userId) => {
        const stored = await AsyncStorage.getItem(FavouriteIds.storageKey(userId));
        if (current && writes.current === writesAtStart) {
          loadedFor.current = userId;
          replace(FavouriteIds.parse(stored));
        }
      })
      .catch(() => {
        if (current) {
          loadedFor.current = null;
        }
      });
    return () => {
      current = false;
    };
  }, [replace]);

  useFocusEffect(load);
  useOnSignIn(load);

  useEffect(
    () =>
      ctx.onSessionEnd(() => {
        loadedFor.current = null;
        writes.current += 1;
        replace(new FavouriteIds([]));
      }),
    [replace],
  );

  const toggle = useCallback(
    async (merchantId: string) => {
      const wanted = !latest.current.has(merchantId);
      await loading.current;
      const userId = await ctx.userId().catch(() => null);
      if (userId === null) {
        return;
      }
      const key = FavouriteIds.storageKey(userId);
      const stored = await AsyncStorage.getItem(key).catch(() => undefined);
      if (stored === undefined) {
        return;
      }
      loadedFor.current = userId;
      replace(FavouriteIds.parse(stored));
      const done = wanted ? 'Added to favourites' : 'Removed from favourites';
      if (latest.current.has(merchantId) === wanted) {
        toast(done);
        return;
      }
      writes.current += 1;
      const next = latest.current.toggled(merchantId);
      replace(next);
      try {
        await AsyncStorage.setItem(key, next.serialize());
        toast(done);
      } catch {
        replace(latest.current.toggled(merchantId));
        toast("Couldn't save your favourites. Try again.");
      }
    },
    [replace, toast],
  );

  return { favourites, toggle };
}
