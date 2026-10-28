import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { cachedMerchant, loadMerchant } from '@/components/storefront';
import { Wordmark } from '@/components/wordmark';
import { FontFamily, Radius, Spacing } from '@/constants/theme';
import type { GiftCard } from '@/ctx/client';
import type { Merchant } from '@/ctx/merchant';
import { useTheme } from '@/hooks/use-theme';
import { money } from '@/money';

export const giftCardAspectRatio = 1.586;
const fallbackHue = 225;

function useMerchant(merchantId: string): Merchant | null {
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

function brandColor(hue: number): string {
  return `hsl(${hue}, 42%, 34%)`;
}

type GiftCardFaceProps = {
  giftCard: GiftCard;
  style?: StyleProp<ViewStyle>;
};

export function GiftCardFace({ giftCard, style }: GiftCardFaceProps) {
  const theme = useTheme();
  const merchant = useMerchant(giftCard.merchantId);
  const ground = brandColor(merchant?.tileHue() ?? fallbackHue);
  const amount = money.ctx(giftCard.cardFiatAmount, giftCard.cardFiatCurrency);
  const initial = giftCard.merchantName.trim().charAt(0).toUpperCase();
  return (
    <View
      accessible
      accessibilityLabel={`${giftCard.merchantName} gift card, ${amount}`}
      style={[styles.card, { backgroundColor: ground }, style]}>
      <View style={[styles.glow, { backgroundColor: theme.onInverse }]} />
      <View style={[styles.glowSmall, { backgroundColor: theme.onInverse }]} />
      <View style={styles.top}>
        <View style={[styles.logoTile, { backgroundColor: theme.backgroundElement }]}>
          {merchant?.logoUrl ? (
            <Image source={{ uri: merchant.logoUrl }} contentFit="contain" style={styles.logo} accessible={false} />
          ) : (
            <Text style={[styles.initial, { color: ground }]}>{initial}</Text>
          )}
        </View>
        <Text style={[styles.kind, { color: theme.onInverseMuted }]} maxFontSizeMultiplier={1.3}>
          Gift card
        </Text>
      </View>
      <View style={styles.bottom}>
        <View style={styles.identity}>
          <Text numberOfLines={1} style={[styles.name, { color: theme.onInverseMuted }]} maxFontSizeMultiplier={1.4}>
            {giftCard.merchantName}
          </Text>
          <Text style={[styles.amount, { color: theme.onInverse }]} maxFontSizeMultiplier={1.4}>
            {amount}
          </Text>
        </View>
        <Wordmark height={18} color={theme.onInverse} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    aspectRatio: giftCardAspectRatio,
    borderRadius: Radius.large,
    padding: Spacing.four,
    justifyContent: 'space-between',
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  glow: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    top: -170,
    right: -120,
    opacity: 0.12,
  },
  glowSmall: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    bottom: -110,
    left: -40,
    opacity: 0.08,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  logoTile: {
    width: 56,
    height: 56,
    borderRadius: Radius.medium,
    padding: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  initial: {
    fontFamily: FontFamily.bold,
    fontSize: 24,
    lineHeight: 28,
  },
  kind: {
    fontFamily: FontFamily.bold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  bottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  identity: {
    flex: 1,
  },
  name: {
    fontFamily: FontFamily.semibold,
    fontSize: 16,
    lineHeight: 22,
  },
  amount: {
    fontFamily: FontFamily.bold,
    fontSize: 30,
    lineHeight: 36,
    fontVariant: ['tabular-nums'],
  },
});
