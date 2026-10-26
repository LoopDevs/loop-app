import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';

import { CountryMenu } from '@/components/country-menu';
import { CountryPicker } from '@/components/country-picker';
import { Button, Field, Notice } from '@/components/form';
import { useScrimScroll } from '@/components/home-panel';
import { MerchantStrip, MerchantTile } from '@/components/merchant-tile';
import { PageHeader } from '@/components/page-header';
import { PressScale } from '@/components/press-scale';
import { useOnSignIn } from '@/components/sign-in';
import { MerchantGridSkeleton } from '@/components/skeleton';
import { MerchantCatalog, PageWidth, SiteFooter, TopCashback, useCatalog } from '@/components/storefront';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  BottomTabInset,
  Brand,
  FontFamily,
  Layout,
  MaxContentWidth,
  Motion,
  Radius,
  Spacing,
} from '@/constants/theme';
import { ctx, type GiftCard } from '@/ctx/client';
import { Merchant } from '@/ctx/merchant';
import type { CountryChoice } from '@/ctx/profile';
import { useAppRefresh } from '@/hooks/use-app-refresh';
import { useBusyAction } from '@/hooks/use-busy-action';
import { useFavourites } from '@/hooks/use-favourites';
import { useMarket } from '@/hooks/use-market';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';

const merchantsPerPage = 20;
const searchDelayMs = 300;
const stripSize = 10;
const cashbackScanSize = 500;
const recentOrdersScanned = 50;
const staggeredTiles = 8;

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
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [search, setSearch] = useState(q ?? '');
  const [query, setQuery] = useState('');
  const { columns, wide, gutter } = usePageLayout();
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
  const reduceMotion = useReducedMotion();
  const { onScroll, scrim, backdrop } = useScrimScroll();

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
  useOnSignIn(loadAccount);

  const [linkedQuery, setLinkedQuery] = useState(q);
  if (q !== linkedQuery) {
    setLinkedQuery(q);
    if (q !== undefined) {
      setSearch(q);
    }
  }

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
        });
        if (request !== latestRequest.current) {
          return;
        }
        setMerchants((shown) => (next === 1 ? result : [...shown, ...result]));
        setPage(next);
        setPages(pagination.pages);
      }),
    [runListing, country, query],
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

  const accountError = account.message !== '' && (
    <Notice message={account.message} actionLabel="Try again" onAction={loadAccount} disabled={busy} />
  );

  if (signedIn === false) {
    return <SignedOutShop initialSearch={search} onOpen={openMerchant} />;
  }

  if (!profile) {
    return (
      <SimplePage title="Shop">
        {account.message === '' ? <MerchantGridSkeleton /> : accountError}
      </SimplePage>
    );
  }

  if (profile.needsSetup() || changingCountry) {
    return (
      <SimplePage title={profile.needsSetup() ? 'Where do you shop?' : 'Change country'}>
        <CountryPicker
          profile={profile}
          busy={busy}
          onChoose={chooseCountry}
          onCancel={profile.needsSetup() ? undefined : () => setChangingCountry(false)}
        />
        {accountError}
      </SimplePage>
    );
  }

  const searching = query !== '';

  return (
    <ThemedView style={styles.container}>
      <StatusBar style="light" />
      <Animated.View pointerEvents="none" style={backdrop} />
      <Animated.FlatList
        data={merchants}
        key={columns}
        keyExtractor={(merchant) => merchant.id}
        numColumns={columns}
        onScroll={onScroll}
        scrollEventThrottle={16}
        columnWrapperStyle={[styles.columns, wide && { maxWidth: Layout.pageMaxWidth, paddingHorizontal: gutter }]}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View>
            <PageHeader
              title="Shop"
              accessory={
                profile.country ? (
                  <CountryButton
                    country={profile.country}
                    disabled={busy}
                    onPress={() => setChangingCountry(true)}
                  />
                ) : null
              }>
              <Field
                onPanel
                value={search}
                onChangeText={setSearch}
                placeholder="Search gift cards"
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </PageHeader>
            <View style={[styles.body, styles.header]}>
              {activeOrder && (
                <ActiveOrderCard
                  merchantName={activeOrder.merchantName}
                  onPress={() => router.push(`/shop/${activeOrder.merchantId}`)}
                />
              )}
              {accountError}
              {!searching && (
                <>
                  <MerchantStrip title="Favourites" merchants={shownFavourites} onOpen={openMerchant} />
                  <MerchantStrip title="Bought recently" merchants={recentlyBought} onOpen={openMerchant} />
                  <MerchantStrip title="Top cashback" merchants={topCashback} onOpen={openMerchant} />
                </>
              )}
              <ThemedText type="heading" accessibilityRole="header">
                {searching ? `Results for “${query}”` : 'All gift cards'}
              </ThemedText>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.body}>
            {busy ? (
              <MerchantGridSkeleton />
            ) : listing.message === '' ? (
              <EmptyResults searching={searching} onClear={() => setSearch('')} />
            ) : null}
          </View>
        }
        ListFooterComponent={
          <View style={[styles.body, styles.footer]}>
            {listing.message !== '' && (
              <Notice
                message={listing.message}
                actionLabel="Try again"
                onAction={() => loadMerchants(retryPage.current)}
                disabled={busy}
              />
            )}
            {merchants.length > 0 && listing.busy && page > 0 && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.loadingMore}>
                Loading more gift cards
              </ThemedText>
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View
            entering={
              reduceMotion
                ? undefined
                : FadeInDown.duration(Motion.state)
                    .delay((index % merchantsPerPage < staggeredTiles ? index % merchantsPerPage : 0) * Motion.stagger)
                    .easing(Motion.easeOut)
            }
            style={[styles.cell, { maxWidth: `${100 / columns}%` }]}>
            <MerchantTile merchant={item} onPress={() => openMerchant(item)} />
          </Animated.View>
        )}
      />
      <Animated.View pointerEvents="none" style={scrim} />
    </ThemedView>
  );
}

function SignedOutShop({ initialSearch, onOpen }: { initialSearch: string; onOpen: (merchant: Merchant) => void }) {
  const { country } = useMarket();
  const catalog = useCatalog(country);
  const [search, setSearch] = useState(initialSearch);
  const { onScroll, scrim, backdrop } = useScrimScroll();
  return (
    <ThemedView style={styles.container}>
      <StatusBar style="light" />
      <Animated.View pointerEvents="none" style={backdrop} />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.simpleContent}
        keyboardShouldPersistTaps="handled">
        <PageHeader title="Shop" accessory={<CountryMenu />} />
        <PageWidth style={styles.storeBody}>
          {search.trim() === '' && <TopCashback catalog={catalog} onOpen={onOpen} />}
          <MerchantCatalog
            country={country}
            categories={catalog?.categories ?? []}
            search={search}
            onSearch={setSearch}
            onOpen={onOpen}
          />
        </PageWidth>
        <SiteFooter />
      </Animated.ScrollView>
      <Animated.View pointerEvents="none" style={scrim} />
    </ThemedView>
  );
}

function SimplePage({ title, children }: { title: string; children: React.ReactNode }) {
  const { onScroll, scrim, backdrop } = useScrimScroll();
  return (
    <ThemedView style={styles.container}>
      <StatusBar style="light" />
      <Animated.View pointerEvents="none" style={backdrop} />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.simpleContent}
        keyboardShouldPersistTaps="handled">
        <PageHeader title={title} />
        <View style={[styles.body, styles.simpleBody]}>{children}</View>
      </Animated.ScrollView>
      <Animated.View pointerEvents="none" style={scrim} />
    </ThemedView>
  );
}

function CountryButton({
  country,
  disabled,
  onPress,
}: {
  country: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Shopping in ${country}. Change country`}
      style={[styles.countryButton, disabled && styles.disabled]}>
      <SymbolView name={{ ios: 'globe', android: 'public', web: 'public' }} size={18} tintColor={Brand.onRoyal} />
      <Text style={styles.countryText} maxFontSizeMultiplier={1.3}>
        {country}
      </Text>
    </PressScale>
  );
}

function ActiveOrderCard({ merchantName, onPress }: { merchantName: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Continue your ${merchantName} order`}
      style={[styles.activeOrder, { backgroundColor: theme.backgroundElement, borderColor: theme.accent }]}>
      <View style={styles.activeOrderText}>
        <ThemedText type="smallBold">Order in progress</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Continue your {merchantName} order
        </ThemedText>
      </View>
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
        size={18}
        tintColor={theme.accent}
      />
    </PressScale>
  );
}

function EmptyResults({ searching, onClear }: { searching: boolean; onClear: () => void }) {
  return (
    <View style={styles.empty}>
      <ThemedText type="heading">{searching ? 'No matches' : 'No gift cards here yet'}</ThemedText>
      <ThemedText themeColor="textSecondary">
        {searching
          ? 'Try a shorter name, or check the spelling.'
          : 'Gift cards for your country show here as soon as they are available.'}
      </ThemedText>
      {searching && <Button label="Clear search" onPress={onClear} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingBottom: BottomTabInset + Spacing.five,
    gap: Spacing.four,
  },
  simpleContent: {
    paddingBottom: BottomTabInset + Spacing.five,
  },
  body: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
  },
  simpleBody: {
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    paddingTop: Spacing.four,
    gap: Spacing.four,
  },
  footer: {
    gap: Spacing.three,
  },
  columns: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  cell: {
    flex: 1,
  },
  storeBody: {
    paddingVertical: Spacing.five,
    gap: Spacing.six,
  },
  countryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.control,
    backgroundColor: Brand.navy,
  },
  countryText: {
    color: Brand.onRoyal,
    fontFamily: FontFamily.semibold,
    fontSize: 15,
  },
  disabled: {
    opacity: 0.5,
  },
  activeOrder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    minHeight: 64,
    borderRadius: Radius.control,
    borderWidth: 1,
  },
  activeOrderText: {
    flex: 1,
  },
  empty: {
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  loadingMore: {
    textAlign: 'center',
  },
});
