import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View, type FlatList } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';

import { CountryMenu } from '@/components/country-menu';
import { Button, Notice } from '@/components/form';
import { StatusBarScrim, useScrimScroll } from '@/components/home-panel';
import { CategoryTiles, MerchantCard, MerchantCardStrip } from '@/components/merchant-card';
import { PageHeader } from '@/components/page-header';
import { PressScale } from '@/components/press-scale';
import { useOnSignIn } from '@/components/sign-in';
import { SiteFooter } from '@/components/site-footer';
import { MerchantGridSkeleton } from '@/components/skeleton';
import {
  cachedMerchantPage,
  loadedCategories,
  loadMerchantPage,
  MerchantCatalog,
  PageWidth,
  TopCashback,
  useCatalog,
} from '@/components/storefront';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Elevation, FontFamily, Layout, MaxContentWidth, Motion, Radius, ScrollEndInset, Spacing } from '@/constants/theme';
import { ctx, type GiftCard } from '@/ctx/client';
import { Merchant } from '@/ctx/merchant';
import { MerchantPaging } from '@/ctx/merchant-paging';
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
const recentOrdersScanned = 50;
const staggeredTiles = 8;

async function loadRecentlyBought(country: string): Promise<Merchant[]> {
  const { result: giftCards } = await ctx.giftCards({
    status: ['fulfilled'],
    perPage: recentOrdersScanned,
  });
  const ids = Merchant.idsByRecentPurchase(giftCards, stripSize);
  return loadByIds(country, ids);
}

function byIdsQuery(country: string, ids: readonly string[]) {
  return { country, ids: [...ids], perPage: ids.length };
}

function cachedByIds(country: string, ids: readonly string[]): Merchant[] {
  return cachedMerchantPage(byIdsQuery(country, ids))?.result ?? [];
}

async function loadByIds(country: string, ids: readonly string[]): Promise<Merchant[]> {
  if (ids.length === 0) {
    return [];
  }
  const { result } = await loadMerchantPage(byIdsQuery(country, ids));
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
  const { profile, setProfile } = useProfile();
  const { country: marketCountry } = useMarket();
  const [activeOrder, setActiveOrder] = useState<GiftCard | null>(null);
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [search, setSearch] = useState(q ?? '');
  const [query, setQuery] = useState('');
  const { columns, wide, gutter } = usePageLayout();
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(0);
  const [recentlyBought, setRecentlyBought] = useState<Merchant[]>([]);
  const [favouriteMerchants, setFavouriteMerchants] = useState<Merchant[]>([]);
  const { favourites, toggle: toggleFavourite } = useFavourites();
  const [pickedCategory, setPickedCategory] = useState<{ country?: string; category: string | null }>({
    category: null,
  });
  const cardColumns = columns > 4 ? 4 : columns > 2 ? columns - 1 : columns;
  const latestRequest = useRef(0);
  const retryPage = useRef(1);
  const listedCountry = useRef<string | undefined>(undefined);
  const reduceMotion = useReducedMotion();
  const { scrollRef, onScroll, scrim } = useScrimScroll<FlatList<Merchant>>();

  const loadAccount = useCallback(
    () =>
      runAccount(async () => {
        const isSignedIn = await ctx.isSignedIn();
        setSignedIn(isSignedIn);
        if (!isSignedIn) {
          return;
        }
        const loadedOrder = ctx.activeGiftCard().catch(() => null);
        setProfile(await ctx.me());
        setActiveOrder(await loadedOrder);
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

  const country = profile ? (profile.country ?? marketCountry) : undefined;
  const catalog = useCatalog(country, stripSize);
  const topCashback = catalog?.top ?? [];
  const category = pickedCategory.country === country ? pickedCategory.category : null;
  const setCategory = (picked: string | null) => setPickedCategory({ country, category: picked });

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
        const merchantQuery = {
          country,
          name: query,
          category: query === '' ? (category ?? undefined) : undefined,
          page: next,
          perPage: merchantsPerPage,
        };
        const cached = next === 1 ? cachedMerchantPage(merchantQuery) : null;
        if (cached) {
          setMerchants(cached.result);
          setPage(1);
          setPages(cached.pagination.pages);
        } else if (next === 1) {
          setPage(0);
        }
        const { result, pagination } = await loadMerchantPage(merchantQuery);
        if (request !== latestRequest.current) {
          return;
        }
        setMerchants((shown) => MerchantPaging.merge(shown, result, next));
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
    loadRecentlyBought(country)
      .catch(() => [])
      .then((recent) => {
        if (current) {
          setRecentlyBought(recent);
        }
      });
    return () => {
      current = false;
    };
  }, [country, signedIn, profile]);

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
  const favouriteOf = (merchant: Merchant) => ({
    saved: favourites.has(merchant.id),
    onToggle: () => toggleFavourite(merchant.id),
  });
  const knownFavourites =
    favouriteMerchants.length > 0 || !country ? favouriteMerchants : cachedByIds(country, favourites.ids);
  const shownFavourites = Merchant.inOrder(knownFavourites, favourites.ids);

  const loadMore = () => {
    const next = MerchantPaging.nextPage(page, pages, busy || listing.message !== '');
    if (next) {
      loadMerchants(next);
    }
  };

  const accountError = account.message !== '' && (
    <Notice message={account.message} actionLabel="Try again" onAction={loadAccount} disabled={busy} />
  );

  if (signedIn === false) {
    return <SignedOutShop initialSearch={search} onOpen={openMerchant} />;
  }

  const pageWidth = wide ? { maxWidth: Layout.pageMaxWidth, paddingHorizontal: gutter } : null;

  if (!profile) {
    return (
      <ShopLoading wide={wide} pageWidth={pageWidth} search={search} onSearch={setSearch}>
        {account.message === '' ? <MerchantGridSkeleton columns={cardColumns} /> : accountError}
      </ShopLoading>
    );
  }

  const searching = query !== '';

  return (
    <ThemedView style={styles.container}>
      <StatusBar style="dark" />
      <Animated.FlatList
        ref={scrollRef}
        data={merchants}
        key={cardColumns}
        keyExtractor={(merchant) => merchant.id}
        numColumns={cardColumns}
        onScroll={onScroll}
        scrollEventThrottle={16}
        columnWrapperStyle={[styles.columns, pageWidth]}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View>
            <PageHeader title="Shop" width={wide ? 'page' : 'content'}>
              <SearchBar value={search} onChangeText={setSearch} />
            </PageHeader>
            <View style={[styles.body, styles.header, pageWidth]}>
              {activeOrder && (
                <ActiveOrderCard
                  merchantName={activeOrder.merchantName}
                  onPress={() => router.push(`/shop/${activeOrder.merchantId}`)}
                />
              )}
              {accountError}
              {!searching && (
                <CategoryTiles
                  categories={country ? loadedCategories(country) : []}
                  selected={category}
                  onSelect={setCategory}
                />
              )}
              {!searching && category === null && (
                <>
                  <MerchantCardStrip
                    title="Top cashback"
                    merchants={topCashback}
                    onOpen={openMerchant}
                    favouriteOf={favouriteOf}
                  />
                  <MerchantCardStrip
                    title="Favourites"
                    merchants={shownFavourites}
                    onOpen={openMerchant}
                    favouriteOf={favouriteOf}
                  />
                  <MerchantCardStrip
                    title="Bought recently"
                    merchants={recentlyBought}
                    onOpen={openMerchant}
                    favouriteOf={favouriteOf}
                  />
                </>
              )}
              <ThemedText type="heading" accessibilityRole="header">
                {searching ? `Results for “${query}”` : category ? Merchant.categoryLabel(category) : 'All gift cards'}
              </ThemedText>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={[styles.body, pageWidth]}>
            {busy ? (
              <MerchantGridSkeleton columns={cardColumns} />
            ) : listing.message === '' ? (
              <EmptyResults
                searching={searching}
                category={searching ? null : category}
                onClear={() => setSearch('')}
                onShowAll={() => setCategory(null)}
              />
            ) : null}
          </View>
        }
        ListFooterComponent={
          <>
            <View style={[styles.body, styles.footer, pageWidth]}>
            {listing.message !== '' && (
              <Notice
                message={listing.message}
                actionLabel="Try again"
                onAction={() => loadMerchants(retryPage.current)}
                disabled={busy}
              />
            )}
            {merchants.length > 0 && listing.busy && page > 0 && (
              <MerchantGridSkeleton columns={cardColumns} rows={1} />
            )}
            </View>
            <SiteFooter />
          </>
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
            style={[styles.cell, { maxWidth: `${100 / cardColumns}%` }]}>
            <MerchantCard merchant={item} onPress={() => openMerchant(item)} favourite={favouriteOf(item)} />
          </Animated.View>
        )}
      />
      <StatusBarScrim style={scrim} />
    </ThemedView>
  );
}

function SignedOutShop({ initialSearch, onOpen }: { initialSearch: string; onOpen: (merchant: Merchant) => void }) {
  const { country } = useMarket();
  const { wide } = usePageLayout();
  const catalog = useCatalog(country, stripSize);
  const [search, setSearch] = useState(initialSearch);
  const loadMoreRef = useRef<(() => void) | null>(null);
  const loadMore = useCallback(() => loadMoreRef.current?.(), []);
  const { scrollRef, onScroll, scrim } = useScrimScroll(loadMore);
  return (
    <ThemedView style={styles.container}>
      <StatusBar style="dark" />
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.simpleContent}
        keyboardShouldPersistTaps="handled">
        <PageHeader title="Shop" width="page" accessory={wide ? null : <CountryMenu />} />
        <PageWidth style={styles.storeBody}>
          {search.trim() === '' && <TopCashback catalog={catalog} onOpen={onOpen} />}
          <MerchantCatalog
            country={country}
            search={search}
            onSearch={setSearch}
            onOpen={onOpen}
            loadMoreRef={loadMoreRef}
          />
        </PageWidth>
        <SiteFooter />
      </Animated.ScrollView>
      <StatusBarScrim style={scrim} />
    </ThemedView>
  );
}

type ShopLoadingProps = {
  wide: boolean;
  pageWidth: { maxWidth: number; paddingHorizontal: number } | null;
  search: string;
  onSearch: (text: string) => void;
  children: React.ReactNode;
};

function ShopLoading({ wide, pageWidth, search, onSearch, children }: ShopLoadingProps) {
  const { scrollRef, onScroll, scrim } = useScrimScroll();
  return (
    <ThemedView style={styles.container}>
      <StatusBar style="dark" />
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.simpleContent}
        keyboardShouldPersistTaps="handled">
        <PageHeader title="Shop" width={wide ? 'page' : 'content'}>
          <SearchBar value={search} onChangeText={onSearch} />
        </PageHeader>
        <View style={[styles.body, styles.header, pageWidth]}>{children}</View>
        <SiteFooter />
      </Animated.ScrollView>
      <StatusBarScrim style={scrim} />
    </ThemedView>
  );
}

function SearchBar({ value, onChangeText }: { value: string; onChangeText: (text: string) => void }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.searchBar,
        Elevation.raised,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}>
      <SymbolView
        name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
        size={20}
        tintColor={theme.textSecondary}
      />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Search gift cards"
        placeholderTextColor={theme.textSecondary}
        selectionColor={theme.accent}
        accessibilityLabel="Search gift cards"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        style={[styles.searchInput, { color: theme.text }]}
      />
    </View>
  );
}

function ActiveOrderCard({ merchantName, onPress }: { merchantName: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Continue your ${merchantName} order`}
      style={[
        styles.activeOrder,
        Elevation.card,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}>
      <View style={styles.activeOrderText}>
        <ThemedText type="smallBold">Order in progress</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Continue your {merchantName} order
        </ThemedText>
      </View>
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
        size={18}
        tintColor={theme.textSecondary}
      />
    </PressScale>
  );
}

type EmptyResultsProps = {
  searching: boolean;
  category: string | null;
  onClear: () => void;
  onShowAll: () => void;
};

function EmptyResults({ searching, category, onClear, onShowAll }: EmptyResultsProps) {
  if (category !== null) {
    return (
      <View style={styles.empty}>
        <ThemedText type="heading">{`No ${Merchant.categoryLabel(category)} gift cards here yet`}</ThemedText>
        <Button label="See all" onPress={onShowAll} />
      </View>
    );
  }
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
    paddingBottom: ScrollEndInset,
    gap: Spacing.four,
  },
  simpleContent: {
    flexGrow: 1,
    paddingBottom: ScrollEndInset,
  },
  body: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
  },
  header: {
    paddingTop: Spacing.four,
    gap: Spacing.five,
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
    paddingBottom: Spacing.two,
  },
  cell: {
    flex: 1,
  },
  storeBody: {
    paddingVertical: Spacing.five,
    gap: Spacing.six,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 56,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    fontFamily: FontFamily.regular,
    fontSize: 16,
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
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  activeOrderText: {
    flex: 1,
  },
  empty: {
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
});
