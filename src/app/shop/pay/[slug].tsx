import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GiftCardPurchase } from '@/components/gift-card-purchase';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { PageTitle } from '@/components/page-title';
import { PayTopBar } from '@/components/pay-top-bar';
import { Button, Notice } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { Spacing } from '@/constants/theme';
import { Market } from '@/ctx/market';
import { useMerchantAccount } from '@/hooks/use-merchant-account';

export default function PayScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { merchant, wallet, walletChecked, profile, signedIn, busy, message, load, setProfile } =
    useMerchantAccount(slug);
  const close = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(`/shop/${slug}`);
  };
  const title = merchant?.name ?? 'Buy gift card';
  const topPadding = Platform.OS === 'ios' ? Spacing.two : insets.top + Spacing.two;

  const fallback = (heading: string, detail: string) => (
    <View
      style={[
        styles.fallback,
        {
          paddingTop: topPadding,
          paddingBottom: insets.bottom + Spacing.three,
        },
      ]}>
      <PayTopBar title={title} onClose={close} />
      <View style={styles.body}>
        <ThemedText type="subtitle" accessibilityRole="header">
          {heading}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
        {message !== '' && <Notice message={message} actionLabel="Try again" onAction={load} disabled={busy} />}
      </View>
      <View style={styles.footer}>
        <Button label="Back to the shop" variant="primary" onPress={close} />
      </View>
    </View>
  );

  const content = () => {
    const settling = signedIn === null || (signedIn && !walletChecked);
    if (!merchant || (settling && message === '')) {
      return (
        <View style={[styles.fallback, { paddingTop: topPadding }]}>
          <PayTopBar title={title} onClose={close} />
          <View style={styles.body}>
            <Skeleton width="60%" height={34} />
            <Skeleton width="100%" height={64} />
            <Skeleton width="100%" height={120} />
          </View>
        </View>
      );
    }
    if (signedIn === false) {
      return fallback('Sign in to buy', `Sign in from the merchant page to buy a ${merchant.name} gift card.`);
    }
    if (!wallet || !profile) {
      return fallback('Finish setting up Loop', 'Turn on Face ID or your fingerprint to pay for gift cards.');
    }
    if (!merchant.isSoldIn(profile.country)) {
      return fallback(
        'Not sold in your country',
        `${merchant.name} gift cards are sold in ${Market.countryName(merchant.country)}.`,
      );
    }
    return (
      <GiftCardPurchase merchant={merchant} wallet={wallet} profile={profile} onProfile={setProfile} onClose={close} />
    );
  };

  return (
    <ThemedView style={styles.screen}>
      <StatusBar style="dark" />
      <Stack.Screen options={{ title }} />
      <PageTitle title={`Buy ${title} gift card`} />
      <KeyboardAvoid style={styles.screen}>{content()}</KeyboardAvoid>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  fallback: {
    flex: 1,
  },
  body: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
});
