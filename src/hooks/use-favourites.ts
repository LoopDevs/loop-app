import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { ctx } from '@/ctx/client';
import { FavouriteIds } from '@/session/favourite-ids';

export function useFavourites() {
  const [favourites, setFavourites] = useState(new FavouriteIds([]));
  const latest = useRef(favourites);
  const loaded = useRef(false);

  const replace = useCallback((next: FavouriteIds) => {
    latest.current = next;
    setFavourites(next);
  }, []);

  const load = useCallback(() => {
    let current = true;
    ctx
      .userId()
      .then((userId) => AsyncStorage.getItem(FavouriteIds.storageKey(userId)))
      .then((stored) => {
        if (current) {
          loaded.current = true;
          replace(FavouriteIds.parse(stored));
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
        return;
      }
      const previous = latest.current;
      const next = previous.toggled(merchantId);
      replace(next);
      try {
        await AsyncStorage.setItem(FavouriteIds.storageKey(await ctx.userId()), next.serialize());
      } catch {
        replace(previous);
      }
    },
    [replace],
  );

  return { favourites, toggle };
}
