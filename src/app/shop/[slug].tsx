import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { ExternalLink } from '@/components/external-link';
import { Button, Notice } from '@/components/form';
import { GiftCardPurchase } from '@/components/gift-card-purchase';
import { CashbackPill, MerchantCover } from '@/components/merchant-tile';
import { PressScale } from '@/components/press-scale';
import { OrderDetailSkeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { BottomTabInset, Brand, FontFamily, MaxContentWidth, Motion, Radius, Spacing } from '@/constants/theme';
import { ctx } from '@/ctx/client';
import type { Merchant } from '@/ctx/merchant';
import { useBusyAction } from '@/hooks/use-busy-action';
import { useFavourites } from '@/hooks/use-favourites';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/native/haptics';
import { SmartWallet } from '@/wallet/smart-wallet';

export default function MerchantScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const { busy, message, run } = useBusyAction();
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [wallet, setWallet] = useState<SmartWallet | null>(null);
  const { favourites, toggle: toggleFavourite } = useFavourites();

  const loadedSlug = useRef<string | undefined>(undefined);

  const load = useCallback(
    () =>
      run(async () => {
        if (loadedSlug.current !== slug) {
          loadedSlug.current = slug;
          setMerchant(null);
        }
        const [loadedMerchant, loadedWallet] = await Promise.all([ctx.merchant(slug), SmartWallet.load()]);
        setMerchant(loadedMerchant);
        setWallet(loadedWallet);
      }),
    [run, slug],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!merchant) {
    return (
      <ThemedView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.panel}>
          <View style={styles.inner}>
            <View style={[styles.coverPlaceholder, { backgroundColor: 'rgba(255, 255, 255, 0.16)' }]} />
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {message === '' ? (
            <OrderDetailSkeleton />
          ) : (
            <Notice message={message} actionLabel="Try again" onAction={load} disabled={busy} />
          )}
        </ScrollView>
      </ThemedView>
    );
  }

  const { info } = merchant;
  const websiteUrl = merchant.websiteUrl();
  const favourite = favourites.has(merchant.id);

  return (
    <ThemedView style={styles.container}>
      <StatusBar style="light" />
      <Stack.Screen options={{ title: merchant.name }} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <View style={styles.panel}>
          <Animated.View
            entering={reduceMotion ? undefined : FadeIn.duration(Motion.transition).easing(Motion.easeOut)}
            style={styles.inner}>
            <View>
              <MerchantCover merchant={merchant} />
              <CashbackPill merchant={merchant} />
            </View>
            <View style={styles.titleRow}>
              <View style={styles.titleBlock}>
                <Text style={styles.name} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
                  {merchant.name}
                </Text>
                {merchant.cashbackBasisPoints() > 0 && (
                  <Text style={styles.rate} maxFontSizeMultiplier={1.6}>
                    {merchant.rateLabel()} on every card
                  </Text>
                )}
              </View>
              <FavouriteButton
                favourite={favourite}
                onPress={() => toggleFavourite(merchant.id)}
              />
            </View>
          </Animated.View>
        </View>

        <View style={styles.content}>
          {wallet ? (
            <GiftCardPurchase merchant={merchant} wallet={wallet} />
          ) : (
            <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <ThemedText type="heading">Set up your wallet first</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Your wallet pays for gift cards and holds your cashback.
              </ThemedText>
              <Button label="Create wallet" variant="primary" onPress={() => router.navigate('/')} />
            </View>
          )}

          {(info?.description || websiteUrl) && (
            <View style={styles.section}>
              <ThemedText type="heading" accessibilityRole="header">
                About {merchant.name}
              </ThemedText>
              {info?.description && (
                <ThemedText type="small" themeColor="textSecondary">
                  {info.description}
                </ThemedText>
              )}
              {websiteUrl && (
                <ExternalLink href={websiteUrl} style={styles.website}>
                  <ThemedText type="linkPrimary">{merchant.website}</ThemedText>
                </ExternalLink>
              )}
            </View>
          )}

          {(info?.instructions || info?.terms) && (
            <View style={styles.section}>
              {info?.instructions && (
                <Collapsible title="How to use">
                  <ThemedText type="small">{info.instructions}</ThemedText>
                </Collapsible>
              )}
              {info?.terms && (
                <Collapsible title="Terms">
                  <ThemedText type="small">{info.terms}</ThemedText>
                </Collapsible>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function FavouriteButton({ favourite, onPress }: { favourite: boolean; onPress: () => void }) {
  return (
    <PressScale
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      scale={0.92}
      accessibilityRole="button"
      accessibilityLabel={favourite ? 'Remove from favourites' : 'Add to favourites'}
      accessibilityState={{ selected: favourite }}
      style={styles.favourite}>
      <SymbolView
        name={
          favourite
            ? { ios: 'heart.fill', android: 'favorite', web: 'favorite' }
            : { ios: 'heart', android: 'favorite_border', web: 'favorite_border' }
        }
        size={24}
        tintColor={Brand.onRoyal}
      />
    </PressScale>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    paddingBottom: BottomTabInset + Spacing.five,
  },
  panel: {
    backgroundColor: Brand.royal,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  coverPlaceholder: {
    aspectRatio: 1.586,
    borderRadius: Radius.tile,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  titleBlock: {
    flex: 1,
    gap: Spacing.one,
  },
  name: {
    color: Brand.onRoyal,
    fontFamily: FontFamily.bold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.6,
  },
  rate: {
    color: Brand.onRoyalMuted,
    fontFamily: FontFamily.medium,
    fontSize: 15,
    lineHeight: 20,
  },
  favourite: {
    width: 48,
    height: 48,
    borderRadius: Radius.control,
    backgroundColor: Brand.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
    gap: Spacing.five,
  },
  card: {
    borderWidth: 1,
    borderRadius: Radius.control,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  section: {
    gap: Spacing.three,
  },
  website: {
    minHeight: 44,
    justifyContent: 'center',
  },
});
