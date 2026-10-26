import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, ScrollView, StyleSheet } from 'react-native';

import { CountryPicker } from '@/components/country-picker';
import { Button, Field } from '@/components/form';
import { MerchantTile } from '@/components/merchant-tile';
import { OrderRowsSkeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { ctx, type GiftCard } from '@/ctx/client';
import type { Merchant } from '@/ctx/merchant';
import { type CountryChoice, Profile } from '@/ctx/profile';
import { useAppRefresh } from '@/hooks/use-app-refresh';
import { useBusyAction } from '@/hooks/use-busy-action';

const merchantsPerPage = 20;
const searchDelayMs = 300;

export default function ShopScreen() {
  const router = useRouter();
  const { busy, message, run } = useBusyAction();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [changingCountry, setChangingCountry] = useState(false);
  const [activeOrder, setActiveOrder] = useState<GiftCard | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(0);
  const latestRequest = useRef(0);
  const retryPage = useRef(1);

  const loadAccount = useCallback(
    () =>
      run(async () => {
        const isSignedIn = await ctx.isSignedIn();
        setSignedIn(isSignedIn);
        if (!isSignedIn) {
          return;
        }
        const [loadedProfile, loadedOrder] = await Promise.all([ctx.me(), ctx.activeGiftCard()]);
        setProfile(loadedProfile);
        setActiveOrder(loadedOrder);
      }),
    [run],
  );

  useFocusEffect(
    useCallback(() => {
      loadAccount();
    }, [loadAccount]),
  );
  useAppRefresh(loadAccount);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), searchDelayMs);
    return () => clearTimeout(timer);
  }, [search]);

  const country = profile && !profile.needsSetup() ? profile.country : undefined;

  const loadMerchants = useCallback(
    (next: number) =>
      run(async () => {
        if (!country) {
          return;
        }
        const request = ++latestRequest.current;
        retryPage.current = next;
        const { result, pagination } = await ctx.merchants({
          country,
          name: query,
          page: next,
          perPage: merchantsPerPage,
        });
        if (request !== latestRequest.current) {
          return;
        }
        setMerchants((shown) => (next === 1 ? result : [...shown, ...result]));
        setPage(next);
        setPages(pagination.pages);
      }),
    [run, country, query],
  );

  useEffect(() => {
    loadMerchants(1);
  }, [loadMerchants]);

  const chooseCountry = (choice: CountryChoice) =>
    run(async () => {
      if (!profile) {
        return;
      }
      let current = profile;
      const sent = new Set<string>();
      let update = current.nextUpdate(choice);
      while (update && !sent.has(Object.keys(update)[0])) {
        sent.add(Object.keys(update)[0]);
        current = current.withUser(await ctx.updateUser(update));
        setProfile(current);
        update = current.nextUpdate(choice);
      }
      setChangingCountry(false);
      setSearch('');
    });

  const loadMore = () => {
    if (!busy && page > 0 && page < pages) {
      loadMerchants(page + 1);
    }
  };

  const errorText = message !== '' && (
    <ThemedText type="small" selectable>
      {message}
    </ThemedText>
  );

  if (signedIn === false) {
    return (
      <ThemedView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText>Sign in to shop gift cards.</ThemedText>
          <Button label="Sign in" onPress={() => router.navigate('/')} />
        </ScrollView>
      </ThemedView>
    );
  }

  if (!profile) {
    return (
      <ThemedView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          {busy || signedIn === null ? (
            <OrderRowsSkeleton />
          ) : (
            <Button label="Retry" onPress={loadAccount} />
          )}
          {errorText}
        </ScrollView>
      </ThemedView>
    );
  }

  if (profile.needsSetup() || changingCountry) {
    return (
      <ThemedView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <CountryPicker
            profile={profile}
            busy={busy}
            onChoose={chooseCountry}
            onCancel={profile.needsSetup() ? undefined : () => setChangingCountry(false)}
          />
          {errorText}
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={merchants}
        keyExtractor={(merchant) => merchant.id}
        numColumns={2}
        columnWrapperStyle={styles.columns}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <ThemedView style={styles.header}>
            {activeOrder && (
              <Button
                label={`Continue your ${activeOrder.merchantName} order`}
                onPress={() => router.push(`/shop/${activeOrder.merchantId}`)}
              />
            )}
            {profile.country && (
              <Button
                label={`${Profile.countryFlag(profile.country)} ${profile.country}`}
                onPress={() => setChangingCountry(true)}
                disabled={busy}
              />
            )}
            <Field
              value={search}
              onChangeText={setSearch}
              placeholder="Search gift cards"
              returnKeyType="search"
            />
          </ThemedView>
        }
        ListEmptyComponent={
          busy ? (
            <OrderRowsSkeleton />
          ) : message === '' ? (
            <ThemedText type="small">No gift cards found.</ThemedText>
          ) : undefined
        }
        ListFooterComponent={
          <>
            {errorText}
            {message !== '' && (
              <Button label="Retry" onPress={() => loadMerchants(retryPage.current)} disabled={busy} />
            )}
          </>
        }
        renderItem={({ item }) => (
          <MerchantTile merchant={item} onPress={() => router.push(`/shop/${item.slug}`)} />
        )}
      />
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
    gap: Spacing.two,
  },
  header: {
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  columns: {
    gap: Spacing.two,
  },
});
