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
import { Merchant, type MerchantCategory } from '@/ctx/merchant';
import { type CountryChoice, Profile } from '@/ctx/profile';
import { useAppRefresh } from '@/hooks/use-app-refresh';
import { useBusyAction } from '@/hooks/use-busy-action';
import { useFavourites } from '@/hooks/use-favourites';
import { useProfile } from '@/hooks/use-profile';

const merchantsPerPage = 20;
const searchDelayMs = 300;
const stripSize = 10;
const cashbackScanSize = 500;
const recentOrdersScanned = 50;

async function loadTopCashback(country: string): Promise<Merchant[]> {
  const { result } = await ctx.merchants({ country, perPage: cashbackScanSize });
  return Merchant.byCashback(result).slice(0, stripSize);
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
  const account = useBusyAction();
  const listing = useBusyAction();
  const busy = account.busy || listing.busy;
  const runAccount = account.run;
  const runListing = listing.run;
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const { profile, setProfile, applyCountryChoice } = useProfile();
  const [changingCountry, setChangingCountry] = useState(false);
  const [activeOrder, setActiveOrder] = useState<GiftCard | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<MerchantCategory | null>(null);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(0);
  const [topCashback, setTopCashback] = useState<Merchant[]>([]);
  const [recentlyBought, setRecentlyBought] = useState<Merchant[]>([]);
  const [favouriteMerchants, setFavouriteMerchants] = useState<Merchant[]>([]);
  const { favourites } = useFavourites();
  const latestRequest = useRef(0);
  const retryPage = useRef(1);
  const listedCountry = useRef<string | undefined>(undefined);

  const loadAccount = useCallback(
    () =>
      runAccount(async () => {
        const isSignedIn = await ctx.isSignedIn();
        setSignedIn(isSignedIn);
        if (!isSignedIn) {
          return;
        }
        const [loadedProfile, loadedOrder] = await Promise.all([ctx.me(), ctx.activeGiftCard()]);
        setProfile(loadedProfile);
        setActiveOrder(loadedOrder);
      }),
    [runAccount, setProfile],
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
      runListing(async () => {
        if (!country) {
          return;
        }
        if (listedCountry.current !== country) {
          listedCountry.current = country;
          setMerchants([]);
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
          category: category?.value,
        });
        if (request !== latestRequest.current) {
          return;
        }
        setMerchants((shown) => (next === 1 ? result : [...shown, ...result]));
        setPage(next);
        setPages(pagination.pages);
      }),
    [runListing, country, query, category],
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
    runAccount(async () => {
      await applyCountryChoice(choice);
      setChangingCountry(false);
      setSearch('');
    });

  const loadMore = () => {
    if (!busy && page > 0 && page < pages) {
      loadMerchants(page + 1);
    }
  };

  const errorText = account.message !== '' && (
    <ThemedText type="small" selectable>
      {account.message}
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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.chips}>
              <Button label="All" selected={category === null} onPress={() => setCategory(null)} />
              {Merchant.categories.map((choice) => (
                <Button
                  key={choice.value}
                  label={choice.label}
                  selected={category?.value === choice.value}
                  onPress={() => setCategory(choice)}
                />
              ))}
            </ScrollView>
            {query === '' && category && <ThemedText type="smallBold">{`${category.label} gift cards`}</ThemedText>}
            {query === '' && !category && (
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
          ) : listing.message !== '' ? undefined : category ? (
            <>
              <ThemedText type="small">{`No ${category.label} gift cards here yet`}</ThemedText>
              <Button label="See all" onPress={() => setCategory(null)} />
            </>
          ) : (
            <ThemedText type="small">No gift cards found.</ThemedText>
          )
        }
        ListFooterComponent={
          <>
            {errorText}
            {account.message !== '' && <Button label="Retry" onPress={loadAccount} disabled={busy} />}
            {listing.message !== '' && (
              <>
                <ThemedText type="small" selectable>
                  {listing.message}
                </ThemedText>
                <Button label="Retry" onPress={() => loadMerchants(retryPage.current)} disabled={busy} />
              </>
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
  chips: {
    gap: Spacing.two,
  },
  columns: {
    gap: Spacing.two,
  },
  cell: {
    flex: 1,
    maxWidth: '50%',
  },
});
