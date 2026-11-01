import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { cachedMerchant, loadMerchant } from '@/components/storefront';
import { FontFamily, Radius } from '@/constants/theme';
import type { Merchant } from '@/ctx/merchant';
import { useTheme } from '@/hooks/use-theme';

const fallbackHue = 225;

export function useMerchant(merchantId: string): Merchant | null {
  const [loaded, setLoaded] = useState<Merchant | null>(null);
  const merchant = cachedMerchant(merchantId) ?? (loaded?.id === merchantId ? loaded : null);
  useEffect(() => {
    if (merchant) {
      return;
    }
    let active = true;
    loadMerchant(merchantId)
      .then((result) => {
        if (active) {
          setLoaded(result);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [merchantId, merchant]);
  return merchant;
}

export function brandGround(merchant: Merchant | null): string {
  return `hsl(${merchant?.tileHue() ?? fallbackHue}, 42%, 34%)`;
}

export function brandTint(merchant: Merchant | null): string {
  return `hsl(${merchant?.tileHue() ?? fallbackHue}, 45%, 92%)`;
}

type MerchantDiscProps = {
  merchantId: string;
  name: string;
  size?: number;
};

export function MerchantDisc({ merchantId, name, size }: MerchantDiscProps) {
  const merchant = useMerchant(merchantId);
  return <LogoDisc merchant={merchant} name={name} size={size} />;
}

type LogoDiscProps = {
  merchant: Merchant | null;
  name: string;
  size?: number;
};

export function LogoDisc({ merchant, name, size = 40 }: LogoDiscProps) {
  const theme = useTheme();
  const frame = { width: size, height: size };
  if (merchant?.logoUrl) {
    return (
      <View style={[styles.disc, frame, { backgroundColor: brandTint(merchant) }]}>
        <Image source={{ uri: merchant.logoUrl }} contentFit="contain" style={styles.logo} accessible={false} />
      </View>
    );
  }
  return (
    <View style={[styles.disc, frame, { backgroundColor: brandGround(merchant) }]}>
      <Text style={[styles.initial, { color: theme.onInverse, fontSize: size * 0.4 }]} maxFontSizeMultiplier={1.2}>
        {name.trim().charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  disc: {
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: {
    width: '72%',
    height: '72%',
  },
  initial: {
    fontFamily: FontFamily.bold,
  },
});
