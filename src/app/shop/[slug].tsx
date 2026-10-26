import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { ExternalLink } from '@/components/external-link';
import { Button } from '@/components/form';
import { GiftCardPurchase } from '@/components/gift-card-purchase';
import { MerchantLogo } from '@/components/merchant-tile';
import { OrderDetailSkeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { ctx } from '@/ctx/client';
import type { Merchant } from '@/ctx/merchant';
import { useBusyAction } from '@/hooks/use-busy-action';
import { SmartWallet } from '@/wallet/smart-wallet';

const cardAspectRatio = 1.586;

export default function MerchantScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { busy, message, run } = useBusyAction();
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [wallet, setWallet] = useState<SmartWallet | null>(null);

  const load = useCallback(
    () =>
      run(async () => {
        const [loadedMerchant, loadedWallet] = await Promise.all([ctx.merchant(slug), SmartWallet.load()]);
        setMerchant(loadedMerchant);
        setWallet(loadedWallet);
      }),
    [run, slug],
  );

  useEffect(() => {
    load();
  }, [load]);

  if (!merchant) {
    return (
      <ThemedView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          {busy ? <OrderDetailSkeleton /> : <Button label="Retry" onPress={load} />}
          {message !== '' && (
            <ThemedText type="small" selectable>
              {message}
            </ThemedText>
          )}
        </ScrollView>
      </ThemedView>
    );
  }

  const { info } = merchant;
  const websiteUrl = merchant.websiteUrl();

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: merchant.name }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {merchant.cardImageUrl ? (
          <Image source={{ uri: merchant.cardImageUrl }} contentFit="cover" style={styles.card} />
        ) : (
          <MerchantLogo merchant={merchant} />
        )}
        <ThemedText type="subtitle">{merchant.name}</ThemedText>
        <ThemedText type="smallBold">{merchant.rateLabel()}</ThemedText>
        {websiteUrl && (
          <ExternalLink href={websiteUrl}>
            <ThemedText type="link">{merchant.website}</ThemedText>
          </ExternalLink>
        )}
        {info?.description && <ThemedText type="small">{info.description}</ThemedText>}
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
        {wallet ? (
          <GiftCardPurchase merchant={merchant} wallet={wallet} />
        ) : (
          <>
            <ThemedText type="small">Create your wallet to buy this gift card.</ThemedText>
            <Button label="Create wallet" onPress={() => router.navigate('/')} />
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.three,
  },
  card: {
    width: '100%',
    aspectRatio: cardAspectRatio,
    borderRadius: Spacing.three,
  },
});
