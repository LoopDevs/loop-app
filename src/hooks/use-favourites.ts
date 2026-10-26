import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { ctx } from '@/ctx/client';
import { FavouriteIds } from '@/session/favourite-ids';

export function useFavourites() {
  const [favourites, setFavourites] = useState(new FavouriteIds([]));

  const load = useCallback(() => {
    let current = true;
    ctx
      .userId()
      .then((userId) => AsyncStorage.getItem(FavouriteIds.storageKey(userId)))
      .then((stored) => {
        if (current) {
          setFavourites(FavouriteIds.parse(stored));
        }
      })
      .catch(() => {
        if (current) {
          setFavourites(new FavouriteIds([]));
        }
      });
    return () => {
      current = false;
    };
  }, []);

  useFocusEffect(load);

  const toggle = useCallback(
    async (merchantId: string) => {
      const next = favourites.toggled(merchantId);
      setFavourites(next);
      await AsyncStorage.setItem(FavouriteIds.storageKey(await ctx.userId()), next.serialize());
    },
    [favourites],
  );

  return { favourites, toggle };
}
