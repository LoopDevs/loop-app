import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { Merchant } from '@/ctx/merchant';

const stripTileWidth = 140;

type TileProps = {
  merchant: Merchant;
  onPress: () => void;
};

export function MerchantTile({ merchant, onPress }: TileProps) {
  return (
    <Pressable style={({ pressed }) => [styles.tile, pressed && styles.pressed]} onPress={onPress}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <MerchantLogo merchant={merchant} />
        <ThemedText type="smallBold" numberOfLines={1}>
          {merchant.name}
        </ThemedText>
        <ThemedText type="small">{merchant.rateLabel()}</ThemedText>
      </ThemedView>
    </Pressable>
  );
}

type StripProps = {
  title: string;
  merchants: Merchant[];
  onOpen: (merchant: Merchant) => void;
};

export function MerchantStrip({ title, merchants, onOpen }: StripProps) {
  if (merchants.length === 0) {
    return null;
  }
  return (
    <View style={styles.strip}>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stripRow}>
        {merchants.map((merchant) => (
          <View key={merchant.id} style={styles.stripTile}>
            <MerchantTile merchant={merchant} onPress={() => onOpen(merchant)} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export function MerchantLogo({ merchant }: { merchant: Merchant }) {
  if (merchant.logoUrl) {
    return (
      <View style={[styles.logo, styles.logoBackdrop]}>
        <Image source={{ uri: merchant.logoUrl }} contentFit="contain" style={styles.logoImage} />
      </View>
    );
  }
  return (
    <View style={[styles.logo, { backgroundColor: `hsl(${merchant.tileHue()}, 45%, 42%)` }]}>
      <Text style={styles.initial}>{merchant.initial()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
  },
  stripTile: {
    width: stripTileWidth,
  },
  strip: {
    gap: Spacing.two,
  },
  stripRow: {
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.one,
  },
  logo: {
    aspectRatio: 1.6,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: Spacing.two,
  },
  logoBackdrop: {
    backgroundColor: '#ffffff',
  },
  logoImage: {
    width: '70%',
    height: '70%',
  },
  initial: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '700',
  },
});
