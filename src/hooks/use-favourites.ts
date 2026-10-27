import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { ctx } from '@/ctx/client';
import { FavouriteIds } from '@/session/favourite-ids';

export function useFavourites() {
  const [favourites, setFavourites] = useState(new FavouriteIds([]));
  const latest = useRef(favourites);
  const loaded = useRef(false);
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
      .then((userId) => AsyncStorage.getItem(FavouriteIds.storageKey(userId)))
      .then((stored) => {
        if (current) {
          loaded.current = true;
          if (writes.current === writesAtStart) {
            replace(FavouriteIds.parse(stored));
          }
        }
      })
      .catch(() => {
        if (current) {
          loaded.current = false;
        }
      });
    return () => {
      current = false;
    };
  }, [replace]);

  useFocusEffect(load);

  const toggle = useCallback(
    async (merchantId: string) => {
      if (!loaded.current) {
        await loading.current;
      }
      if (!loaded.current) {
        return;
      }
      writes.current += 1;
      const next = latest.current.toggled(merchantId);
      replace(next);
      try {
        await AsyncStorage.setItem(FavouriteIds.storageKey(await ctx.userId()), next.serialize());
      } catch {
        replace(latest.current.toggled(merchantId));
      }
    },
    [replace],
  );

  return { favourites, toggle };
}
