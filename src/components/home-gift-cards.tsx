import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { MerchantTile } from '@/components/merchant-tile';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Motion, Spacing } from '@/constants/theme';
import { ctx } from '@/ctx/client';
import { Merchant } from '@/ctx/merchant';

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

export function HomeGiftCards({ onOpen }: { onOpen: (slug: string) => void }) {
  const [merchants, setMerchants] = useState<Merchant[] | null>(null);

  useEffect(() => {
    let current = true;
    loadTopCashback()
      .catch(() => [])
      .then((loaded) => current && setMerchants(loaded));
    return () => {
      current = false;
    };
  }, []);

  if (merchants !== null && merchants.length === 0) {
    return null;
  }
  return (
    <View style={styles.section}>
      <ThemedText type="heading" accessibilityRole="header">
        Top cashback
      </ThemedText>
      <View style={styles.grid}>
        {(merchants ?? placeholders).map((merchant, index) => (
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
    columnGap: Spacing.three,
  },
  cell: {
    width: '47%',
    flexGrow: 1,
  },
});
