import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';

import { CountryPicker } from '@/components/country-picker';
import { Button, Field } from '@/components/form';
import { MerchantStrip, MerchantTile } from '@/components/merchant-tile';
import { OrderRowsSkeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { ctx, type GiftCard } from '@/ctx/client';
import { Merchant } from '@/ctx/merchant';
import { type CountryChoice, Profile } from '@/ctx/profile';
import { useAppRefresh } from '@/hooks/use-app-refresh';
import { useBusyAction } from '@/hooks/use-busy-action';
import { useFavourites } from '@/hooks/use-favourites';

const merchantsPerPage = 20;
const searchDelayMs = 300;
const stripSize = 10;
const recentOrdersScanned = 50;

async function loadTopCashback(country: string): Promise<Merchant[]> {
  const { result } = await ctx.merchants({ country, order: '-discount', perPage: stripSize });
  return Merchant.byCashback(result);
}

async function loadRecentlyBought(country: string): Promise<Merchant[]> {
  const { result: giftCards } = await ctx.giftCards({
    status: ['fulfilled'],
    perPage: recentOrdersScanned,
  });
  const ids = Merchant.idsByRecentPurchase(giftCards, stripSize);
  return loadByIds(country, ids);
}

async function loadByIds(country: string, ids: readonly string[]): Promise<Merchant[]> {
  if (ids.length === 0) {
    return [];
  }
  const { result } = await ctx.merchants({ country, ids: [...ids], perPage: ids.length });
  return Merchant.inOrder(result, ids);
}

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
  const [topCashback, setTopCashback] = useState<Merchant[]>([]);
  const [recentlyBought, setRecentlyBought] = useState<Merchant[]>([]);
  const [favouriteMerchants, setFavouriteMerchants] = useState<Merchant[]>([]);
  const { favourites } = useFavourites();
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
        if (next === 1) {
          setPage(0);
        }
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

  useEffect(() => {
    if (!country) {
      return;
    }
    let current = true;
    Promise.all([
      loadTopCashback(country).catch(() => []),
      loadRecentlyBought(country).catch(() => []),
    ]).then(([top, recent]) => {
      if (current) {
        setTopCashback(top);
        setRecentlyBought(recent);
      }
    });
    return () => {
      current = false;
    };
  }, [country]);

  useEffect(() => {
    if (!country) {
      return;
    }
    let current = true;
    loadByIds(country, favourites.ids)
      .catch(() => [])
      .then((loaded) => {
        if (current) {
          setFavouriteMerchants(loaded);
        }
      });
    return () => {
      current = false;
    };
  }, [country, favourites]);

  const openMerchant = (merchant: Merchant) => router.push(`/shop/${merchant.slug}`);
  const shownFavourites = Merchant.inOrder(favouriteMerchants, favourites.ids);

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
            {query === '' && (
              <>
                <MerchantStrip title="Favourites" merchants={shownFavourites} onOpen={openMerchant} />
                <MerchantStrip title="Bought recently" merchants={recentlyBought} onOpen={openMerchant} />
                <MerchantStrip title="Top cashback" merchants={topCashback} onOpen={openMerchant} />
                <ThemedText type="smallBold">All gift cards</ThemedText>
              </>
            )}
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
          <View style={styles.cell}>
            <MerchantTile merchant={item} onPress={() => openMerchant(item)} />
          </View>
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
  cell: {
    flex: 1,
    maxWidth: '50%',
  },
});
