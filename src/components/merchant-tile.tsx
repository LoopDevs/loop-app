import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { PressScale } from '@/components/press-scale';
import { ThemedText } from '@/components/themed-text';
import { Brand, FontFamily, Motion, Radius, Spacing } from '@/constants/theme';
import type { Merchant } from '@/ctx/merchant';
import { useTheme } from '@/hooks/use-theme';

const coverAspect = 1.586;

type TileProps = {
  merchant: Merchant;
  onPress: () => void;
};

export function MerchantTile({ merchant, onPress }: TileProps) {
  return (
    <PressScale
      style={styles.tile}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${merchant.name}, ${merchant.rateLabel()}`}>
      <View>
        <MerchantCover merchant={merchant} />
        <CashbackPill merchant={merchant} />
      </View>
      <ThemedText type="smallBold" style={styles.name}>
        {merchant.name}
      </ThemedText>
    </PressScale>
  );
}

export function CashbackPill({ merchant }: { merchant: Merchant }) {
  if (merchant.cashbackBasisPoints() <= 0) {
    return null;
  }
  return (
    <View style={styles.pill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text maxFontSizeMultiplier={1.3} style={styles.pillText}>
        {merchant.rateFigure()}
      </Text>
    </View>
  );
}

export function MerchantCover({ merchant }: { merchant: Merchant }) {
  const theme = useTheme();
  if (merchant.cardImageUrl) {
    return (
      <View style={[styles.cover, { backgroundColor: theme.backgroundSelected }]}>
        <Image
          source={{ uri: merchant.cardImageUrl }}
          contentFit="cover"
          transition={Motion.state}
          style={StyleSheet.absoluteFill}
        />
        {merchant.logoUrl && (
          <View style={styles.coverLogo}>
            <Image source={{ uri: merchant.logoUrl }} contentFit="contain" style={styles.coverLogoImage} />
          </View>
        )}
      </View>
    );
  }
  return <MerchantLogo merchant={merchant} />;
}

export function MerchantLogo({ merchant }: { merchant: Merchant }) {
  if (merchant.logoUrl) {
    return (
      <View style={[styles.cover, styles.logoBackdrop]}>
        <Image
          source={{ uri: merchant.logoUrl }}
          contentFit="contain"
          transition={Motion.state}
          style={styles.logoImage}
        />
      </View>
    );
  }
  return (
    <View style={[styles.cover, { backgroundColor: `hsl(${merchant.tileHue()}, 45%, 38%)` }]}>
      <Text style={styles.initial}>{merchant.initial()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    gap: Spacing.two,
  },
  name: {
    paddingRight: Spacing.one,
  },
  cover: {
    aspectRatio: coverAspect,
    borderRadius: Radius.tile,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverLogo: {
    position: 'absolute',
    left: Spacing.two,
    bottom: Spacing.two,
    width: 36,
    height: 36,
    borderRadius: Radius.tile,
    backgroundColor: '#FFFFFF',
    padding: Spacing.one,
  },
  coverLogoImage: {
    flex: 1,
  },
  logoBackdrop: {
    backgroundColor: '#FFFFFF',
  },
  logoImage: {
    width: '72%',
    height: '72%',
  },
  initial: {
    color: '#FFFFFF',
    fontSize: 32,
    fontFamily: FontFamily.bold,
  },
  pill: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    borderRadius: Radius.pill,
    backgroundColor: Brand.pillGround,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  pillText: {
    color: Brand.pillText,
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
    fontFamily: FontFamily.bold,
  },
});
