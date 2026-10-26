import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Notice } from '@/components/form';
import { MerchantTile } from '@/components/merchant-tile';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Motion, Spacing } from '@/constants/theme';
import { ctx } from '@/ctx/client';
import { Merchant } from '@/ctx/merchant';
import { errorMessage } from '@/hooks/use-busy-action';

const cardsShown = 6;
const cashbackScanSize = 200;
const placeholderHeight = 112;

async function loadTopCashback(): Promise<Merchant[]> {
  const profile = await ctx.me();
  if (profile.needsSetup() || !profile.country) {
    return [];
  }
  const { result } = await ctx.merchants({ country: profile.country, perPage: cashbackScanSize });
  return Merchant.byCashback(result).slice(0, cardsShown);
}

type HomeGiftCardsProps = {
  onOpen: (slug: string) => void;
  refreshKey: number;
};

export function HomeGiftCards({ onOpen, refreshKey }: HomeGiftCardsProps) {
  const [merchants, setMerchants] = useState<Merchant[] | null>(null);
  const [failure, setFailure] = useState('');
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const request = ++latestRequest.current;
    setFailure('');
    try {
      const loaded = await loadTopCashback();
      if (request === latestRequest.current) {
        setMerchants(loaded);
      }
    } catch (error) {
      if (request === latestRequest.current) {
        setFailure(errorMessage(error));
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        latestRequest.current += 1;
      };
    }, [load]),
  );

  const loadedKey = useRef(refreshKey);
  useEffect(() => {
    if (loadedKey.current !== refreshKey) {
      loadedKey.current = refreshKey;
      load();
    }
  }, [refreshKey, load]);

  const failed = failure !== '';
  if (!failed && merchants !== null && merchants.length === 0) {
    return null;
  }
  const shown: (Merchant | null)[] = merchants ??(failed ? [] : placeholders);
  return (
    <View style={styles.section}>
      <ThemedText type="heading" accessibilityRole="header">
        Top cashback
      </ThemedText>
      {failed && <Notice message={failure} actionLabel="Try again" onAction={load} />}
      <View style={styles.grid}>
        {shown.map((merchant, index) => (
          <Animated.View
            key={merchant ? merchant.id : `placeholder-${index}`}
            entering={FadeInDown.duration(Motion.state).delay(index * Motion.stagger)}
            style={styles.cell}>
            {merchant ? (
              <MerchantTile merchant={merchant} onPress={() => onOpen(merchant.slug)} />
            ) : (
              <Skeleton width="100%" height={placeholderHeight} />
            )}
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const placeholders: null[] = Array.from({ length: cardsShown }, () => null);

const styles = StyleSheet.create({
  section: {
    gap: Spacing.three,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: Spacing.four,
    marginHorizontal: -Spacing.three / 2,
  },
  cell: {
    width: '50%',
    paddingHorizontal: Spacing.three / 2,
  },
});
