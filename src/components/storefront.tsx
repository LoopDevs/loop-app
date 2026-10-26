import { Image } from 'expo-image';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputKeyPressEvent,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';

import { ExternalLink } from '@/components/external-link';
import { Button, Notice } from '@/components/form';
import { MerchantCard } from '@/components/merchant-card';
import { PressScale } from '@/components/press-scale';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Wordmark } from '@/components/wordmark';
import { loopLinks } from '@/constants/loop-links';
import { Elevation, FontFamily, Layout, Motion, Radius, Spacing } from '@/constants/theme';
import { ctx, type MerchantPage, type MerchantQuery } from '@/ctx/client';
import { Merchant } from '@/ctx/merchant';
import { CategoryTally, MerchantPaging } from '@/ctx/merchant-paging';
import { useBusyAction } from '@/hooks/use-busy-action';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useTheme } from '@/hooks/use-theme';
import { Savings } from '@/wallet/savings';

const catalogTopSize = 10;
const heroPhoto = require('@/assets/images/home-shopping.jpg');
const catalogPageSize = 24;
const searchDelayMs = 300;
const cardHeight = 230;
const suggestionLimit = 6;
const suggestionScanSize = 20;
const suggestionDelayMs = 120;

export type Catalog = {
  top: Merchant[];
  total: number;
};

const catalogRequests = new Map<string, Promise<Catalog>>();
const loadedCatalogs = new Map<string, Catalog>();
const loadedMerchants = new Map<string, Merchant>();
const loadedPages = new Map<string, MerchantPage>();
const categoryTallies = new Map<string, CategoryTally>();

export function loadedCategories(country: string): string[] {
  return categoryTallies.get(country)?.list() ?? [];
}

function tallyCategories(country: string, merchants: readonly Merchant[]) {
  const tally = categoryTallies.get(country) ?? new CategoryTally();
  tally.add(merchants);
  categoryTallies.set(country, tally);
}

function rememberMerchants(merchants: readonly Merchant[]) {
  for (const merchant of merchants) {
    loadedMerchants.set(merchant.id, merchant);
    loadedMerchants.set(merchant.slug, merchant);
  }
}

export function cachedMerchant(idOrSlug: string): Merchant | null {
  return loadedMerchants.get(idOrSlug) ?? null;
}

export async function loadMerchant(idOrSlug: string): Promise<Merchant> {
  const merchant = await ctx.merchant(idOrSlug);
  rememberMerchants([merchant]);
  loadedMerchants.set(idOrSlug, merchant);
  return merchant;
}

function pageKey(query: MerchantQuery): string {
  return JSON.stringify([
    query.country,
    query.name ?? '',
    query.ids ?? [],
    query.category ?? '',
    query.order ?? '',
    query.page ?? 1,
    query.perPage,
  ]);
}

export function cachedMerchantPage(query: MerchantQuery): MerchantPage | null {
  return loadedPages.get(pageKey(query)) ?? null;
}

export async function loadMerchantPage(query: MerchantQuery): Promise<MerchantPage> {
  const loaded = await ctx.merchants(query);
  rememberMerchants(loaded.result);
  tallyCategories(query.country, loaded.result);
  loadedPages.set(pageKey(query), loaded);
  return loaded;
}

function catalogKey(country: string, size: number): string {
  return `${country}:${size}`;
}

export function loadCatalog(country: string, size: number): Promise<Catalog> {
  const key = catalogKey(country, size);
  const pending = catalogRequests.get(key);
  if (pending) {
    return pending;
  }
  const request = loadMerchantPage({ country, order: '-discount,name', perPage: size })
    .then(({ result, pagination }) => {
      const catalog = {
        top: Merchant.byCashback(result).filter((merchant) => merchant.cashbackBasisPoints() > 0),
        total: pagination.total,
      };
      loadedCatalogs.set(key, catalog);
      return catalog;
    })
    .catch(() => {
      catalogRequests.delete(key);
      return { top: [], total: 0 };
    });
  catalogRequests.set(key, request);
  return request;
}

export function useCatalog(country: string | undefined, size = catalogTopSize) {
  const key = country ? catalogKey(country, size) : null;
  const [loaded, setLoaded] = useState<{ key: string; catalog: Catalog } | null>(() => {
    const cached = key ? loadedCatalogs.get(key) : undefined;
    return key && cached ? { key, catalog: cached } : null;
  });
  useEffect(() => {
    if (!country || !key) {
      return;
    }
    let current = true;
    loadCatalog(country, size).then((catalog) => current && setLoaded({ key, catalog }));
    return () => {
      current = false;
    };
  }, [country, size, key]);
  return loaded && loaded.key === key ? loaded.catalog : null;
}

export function PageWidth({ children, style }: { children: ReactNode; style?: object }) {
  const { gutter } = usePageLayout();
  return <View style={[styles.page, { paddingHorizontal: gutter }, style]}>{children}</View>;
}

type HeroProps = {
  catalog: Catalog | null;
  country: string;
  search: string;
  onSearch: (text: string) => void;
  onSubmitSearch: () => void;
  onOpen: (merchant: Merchant) => void;
  accessory?: ReactNode;
};

export function StorefrontHero({ catalog, country, search, onSearch, onSubmitSearch, onOpen, accessory }: HeroProps) {
  const { wide } = usePageLayout();
  const reduceMotion = useReducedMotion();
  const theme = useTheme();
  const best = catalog?.top[0];
  return (
    <View style={styles.hero}>
      <PageWidth style={[styles.heroInner, wide && styles.heroInnerWide]}>
        <Animated.View
          entering={
            reduceMotion || Platform.OS === 'web'
              ? undefined
              : FadeInDown.duration(Motion.transition).easing(Motion.easeOut)
          }
          style={[styles.heroCopy, wide && styles.heroCopyWide]}>
          {!wide && (
            <View style={styles.heroTopRow}>
              <Wordmark height={22} />
              {accessory}
            </View>
          )}
          <Text style={[styles.headline, wide && styles.headlineWide, { color: theme.text }]} accessibilityRole="header">
            Gift cards that pay you back.
          </Text>
          <Text style={[styles.heroLine, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.6}>
            {best
              ? `Buy gift cards for the shops you already use and earn up to ${best.rateFigure()} cashback.`
              : 'Buy gift cards for the shops you already use and earn cashback on every card.'}
          </Text>
          <MerchantSearch
            country={country}
            value={search}
            onChangeText={onSearch}
            onSubmit={onSubmitSearch}
            onOpen={onOpen}
            large
          />
        </Animated.View>
        <HeroPhoto best={best ?? null} onOpen={onOpen} />
      </PageWidth>
    </View>
  );
}

function HeroPhoto({ best, onOpen }: { best: Merchant | null; onOpen: (merchant: Merchant) => void }) {
  const { wide } = usePageLayout();
  const reduceMotion = useReducedMotion();
  const theme = useTheme();
  return (
    <Animated.View
      entering={
        reduceMotion || Platform.OS === 'web'
          ? undefined
          : FadeIn.duration(Motion.transition).delay(Motion.stagger * 2)
      }
      style={[styles.heroPhotoWrap, wide && styles.heroPhotoWrapWide]}>
      <View style={[styles.heroPhoto, wide && styles.heroPhotoWide, Elevation.raised]}>
        <Image
          source={heroPhoto}
          contentFit="cover"
          style={styles.heroPhotoImage}
          accessibilityLabel="A happy shopper holding shopping bags"
        />
      </View>
      {best && best.cashbackBasisPoints() > 0 && (
        <PressScale
          onPress={() => onOpen(best)}
          accessibilityRole="link"
          accessibilityLabel={`${best.name}, ${best.rateLabel()}`}
          style={[
            styles.heroOffer,
            wide && styles.heroOfferWide,
            Elevation.raised,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}>
          <View style={[styles.heroOfferLogo, { borderColor: theme.border }]}>
            {best.logoUrl ? (
              <Image source={{ uri: best.logoUrl }} contentFit="contain" style={styles.heroOfferLogoImage} />
            ) : (
              <Text style={[styles.heroOfferInitial, { color: theme.text }]}>{best.initial()}</Text>
            )}
          </View>
          <View style={styles.heroOfferText}>
            <Text style={[styles.heroOfferName, { color: theme.textSecondary }]} numberOfLines={1}>
              {best.name}
            </Text>
            <Text style={[styles.heroOfferRate, { color: theme.accent }]}>{best.rateLabel()}</Text>
          </View>
        </PressScale>
      )}
    </Animated.View>
  );
}

type MerchantSearchProps = {
  country: string;
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  onOpen: (merchant: Merchant) => void;
  large?: boolean;
};

export function MerchantSearch({ country, value, onChangeText, onSubmit, onOpen, large = false }: MerchantSearchProps) {
  const found = useSearchResults(country, value);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const query = value.trim();
  const suggestions = useMemo(() => Merchant.matching(found, query, suggestionLimit), [found, query]);
  const open = focused && !dismissed && suggestions.length > 0;

  const change = (text: string) => {
    setHighlight(-1);
    setDismissed(false);
    onChangeText(text);
  };

  const pick = (merchant: Merchant) => {
    setHighlight(-1);
    setDismissed(true);
    onChangeText('');
    onOpen(merchant);
  };

  const submit = () => {
    const picked = open ? suggestions[highlight] : undefined;
    if (picked) {
      pick(picked);
      return;
    }
    setDismissed(true);
    onSubmit();
  };

  const moveHighlight = (event: TextInputKeyPressEvent) => {
    const key = event.nativeEvent.key;
    if (key === 'Escape') {
      setDismissed(true);
      setHighlight(-1);
      return;
    }
    if ((key !== 'ArrowDown' && key !== 'ArrowUp') || suggestions.length === 0) {
      return;
    }
    event.preventDefault();
    const step = key === 'ArrowDown' ? 1 : -1;
    const positions = suggestions.length + 1;
    setDismissed(false);
    setHighlight((current) => ((current + 1 + step + positions) % positions) - 1);
  };

  return (
    <View style={[styles.merchantSearch, large && styles.merchantSearchLarge, open && styles.merchantSearchOpen]}>
      <SearchBar
        value={value}
        onChangeText={change}
        onSubmit={submit}
        onKeyPress={moveHighlight}
        onFocusChange={setFocused}
        expanded={open}
        large={large}
      />
      {open && (
        <SearchSuggestions
          merchants={suggestions}
          highlight={highlight}
          onHighlight={setHighlight}
          onPick={pick}
        />
      )}
    </View>
  );
}

function useSearchResults(country: string, text: string): Merchant[] {
  const name = text.trim();
  const query = useMemo(() => ({ country, name, perPage: suggestionScanSize }), [country, name]);
  const searchable = name.length >= 2;
  const cached = searchable ? cachedMerchantPage(query) : null;
  const [loaded, setLoaded] = useState<Merchant[]>([]);
  useEffect(() => {
    if (!searchable || cached) {
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      loadMerchantPage(query)
        .then((page) => current && setLoaded(page.result))
        .catch(() => undefined);
    }, suggestionDelayMs);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, searchable, cached]);
  return cached ? cached.result : loaded;
}

type SuggestionsProps = {
  merchants: Merchant[];
  highlight: number;
  onHighlight: (index: number) => void;
  onPick: (merchant: Merchant) => void;
};

function SearchSuggestions({ merchants, highlight, onHighlight, onPick }: SuggestionsProps) {
  const theme = useTheme();
  return (
    <Animated.View
      entering={FadeIn.duration(Motion.feedback)}
      style={[styles.suggestions, Elevation.raised, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      {merchants.map((merchant, index) => (
        <Pressable
          key={merchant.id}
          {...(Platform.OS === 'web'
            ? { onPressIn: () => onPick(merchant), delayPressIn: 0 }
            : { onPress: () => onPick(merchant) })}
          onHoverIn={() => onHighlight(index)}
          accessibilityRole="button"
          accessibilityLabel={`${merchant.name}, ${merchant.rateLabel()}`}
          style={[styles.suggestion, index === highlight && { backgroundColor: theme.backgroundSelected }]}>
          <View style={[styles.suggestionLogo, { borderColor: theme.border }]}>
            {merchant.logoUrl ? (
              <Image source={{ uri: merchant.logoUrl }} contentFit="contain" style={styles.suggestionLogoImage} />
            ) : (
              <View style={[styles.suggestionInitial, { backgroundColor: `hsl(${merchant.tileHue()}, 42%, 34%)` }]}>
                <Text style={styles.suggestionInitialText}>{merchant.initial()}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.suggestionName, { color: theme.text }]} numberOfLines={1}>
            {merchant.name}
          </Text>
          {merchant.cashbackBasisPoints() > 0 && (
            <Text style={[styles.suggestionRate, { color: theme.accent }]}>{merchant.rateLabel()}</Text>
          )}
        </Pressable>
      ))}
    </Animated.View>
  );
}

type SearchBarProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit?: () => void;
  onKeyPress?: (event: TextInputKeyPressEvent) => void;
  onFocusChange?: (focused: boolean) => void;
  expanded?: boolean;
  large?: boolean;
  placeholder?: string;
};

function SearchBar({
  value,
  onChangeText,
  onSubmit,
  onKeyPress,
  onFocusChange,
  expanded = false,
  large = false,
  placeholder = 'Search gift cards',
}: SearchBarProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const focus = (next: boolean) => {
    setFocused(next);
    onFocusChange?.(next);
  };
  return (
    <View
      style={[
        styles.search,
        large && styles.searchLarge,
        (large || focused) && Elevation.raised,
        { backgroundColor: theme.backgroundElement, borderColor: focused ? theme.borderStrong : theme.border },
      ]}>
      <SymbolView
        name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
        size={large ? 22 : 18}
        tintColor={theme.textSecondary}
      />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        onKeyPress={onKeyPress}
        role="searchbox"
        aria-expanded={expanded}
        placeholder={placeholder}
        accessibilityLabel={placeholder}
        placeholderTextColor={theme.textSecondary}
        selectionColor={theme.accent}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        onFocus={() => focus(true)}
        onBlur={() => focus(false)}
        style={[styles.searchInput, large && styles.searchInputLarge, { color: theme.text }]}
      />
      {value !== '' && (
        <Pressable onPress={() => onChangeText('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}>
          <SymbolView name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }} size={18} tintColor={theme.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}

type GridProps = {
  merchants: (Merchant | null)[];
  onOpen: (merchant: Merchant) => void;
  stagger?: boolean;
};

export function MerchantGrid({ merchants, onOpen, stagger = true }: GridProps) {
  const { columns } = usePageLayout();
  const reduceMotion = useReducedMotion();
  const cellWidth = `${100 / columns}%` as const;
  return (
    <View style={styles.grid}>
      {merchants.map((merchant, index) => (
        <Animated.View
          key={merchant ? merchant.id : `placeholder-${index}`}
          entering={
            reduceMotion || !stagger
              ? undefined
              : FadeInDown.duration(Motion.state)
                  .delay((index % catalogPageSize) * (Motion.stagger / 2))
                  .easing(Motion.easeOut)
          }
          style={[styles.cell, { width: cellWidth }]}>
          {merchant ? (
            <MerchantCard merchant={merchant} onPress={() => onOpen(merchant)} />
          ) : (
            <Skeleton width="100%" height={cardHeight} />
          )}
        </Animated.View>
      ))}
    </View>
  );
}

export function TopCashback({ catalog, onOpen }: { catalog: Catalog | null; onOpen: (merchant: Merchant) => void }) {
  const { columns, wide } = usePageLayout();
  const shown = wide ? columns : columns * 2;
  if (catalog && catalog.top.length === 0) {
    return null;
  }
  return (
    <View style={styles.section}>
      <SectionHeading title="Top cashback" detail="The highest rates in your country right now." />
      <MerchantGrid
        merchants={catalog ? catalog.top.slice(0, shown) : Array.from({ length: shown }, () => null)}
        onOpen={onOpen}
      />
    </View>
  );
}

function SectionHeading({ title, detail, accessory }: { title: string; detail?: string; accessory?: ReactNode }) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionHeadingText}>
        <ThemedText type="subtitle" accessibilityRole="header">
          {title}
        </ThemedText>
        {detail && (
          <ThemedText type="small" themeColor="textSecondary">
            {detail}
          </ThemedText>
        )}
      </View>
      {accessory}
    </View>
  );
}

type CatalogProps = {
  country: string;
  search: string;
  onSearch: (text: string) => void;
  onOpen: (merchant: Merchant) => void;
  loadMoreRef: MutableRefObject<(() => void) | null>;
};

export function MerchantCatalog({ country, search, onSearch, onOpen, loadMoreRef }: CatalogProps) {
  const { wide, columns } = usePageLayout();
  const categories = loadedCategories(country);
  const [query, setQuery] = useState(search.trim());
  const [pickedCategory, setPickedCategory] = useState<{ country: string; category: string | null }>({
    country,
    category: null,
  });
  const category = pickedCategory.country === country ? pickedCategory.category : null;
  const setCategory = (picked: string | null) => setPickedCategory({ country, category: picked });
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const { busy, message, run } = useBusyAction();
  const latestRequest = useRef(0);
  const retryPage = useRef(1);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), searchDelayMs);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    (next: number) =>
      run(async () => {
        const request = ++latestRequest.current;
        retryPage.current = next;
        const merchantQuery = {
          country,
          name: query,
          category: category ?? undefined,
          page: next,
          perPage: catalogPageSize,
        };
        const cached = next === 1 ? cachedMerchantPage(merchantQuery) : null;
        if (cached) {
          setMerchants(cached.result);
          setPage(1);
          setPages(cached.pagination.pages);
          setTotal(cached.pagination.total);
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
        setTotal(pagination.total);
      }),
    [run, country, query, category],
  );

  useEffect(() => {
    load(1);
  }, [load]);

  useEffect(() => {
    loadMoreRef.current = () => {
      const next = MerchantPaging.nextPage(page, pages, busy || message !== '');
      if (next) {
        load(next);
      }
    };
    return () => {
      loadMoreRef.current = null;
    };
  }, [loadMoreRef, load, page, pages, busy, message]);

  const searching = query !== '';
  const firstLoad = page === 0 && busy;
  const title = searching ? `Results for “${query}”` : category ? Merchant.categoryLabel(category) : 'All gift cards';
  const detail = total === null ? undefined : `${total} ${total === 1 ? 'gift card' : 'gift cards'}`;

  return (
    <View style={styles.section}>
      <SectionHeading
        title={title}
        detail={detail}
        accessory={
          wide ? (
            <View style={styles.catalogSearch}>
              <SearchBar value={search} onChangeText={onSearch} placeholder="Filter by name" />
            </View>
          ) : null
        }
      />
      {!wide && <SearchBar value={search} onChangeText={onSearch} />}
      {categories.length > 0 && (
        <View style={styles.chips} accessibilityRole="tablist">
          <Chip label="All" selected={category === null} onPress={() => setCategory(null)} />
          {categories.map((name) => (
            <Chip
              key={name}
              label={Merchant.categoryLabel(name)}
              selected={category === name}
              onPress={() => setCategory(category === name ? null : name)}
            />
          ))}
        </View>
      )}
      {firstLoad ? (
        <MerchantGrid merchants={Array.from({ length: 12 }, () => null)} onOpen={onOpen} stagger={false} />
      ) : merchants.length > 0 ? (
        <MerchantGrid
          merchants={busy && page > 0 ? [...merchants, ...Array.from({ length: columns }, () => null)] : merchants}
          onOpen={onOpen}
        />
      ) : message === '' && page > 0 ? (
        <View style={styles.empty}>
          <ThemedText type="heading">{searching ? 'No matches' : 'No gift cards here yet'}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {searching
              ? 'Try a shorter name, or check the spelling.'
              : 'Gift cards for this country show here as soon as they are available.'}
          </ThemedText>
          {searching && (
            <View style={styles.inlineButton}>
              <Button label="Clear search" onPress={() => onSearch('')} />
            </View>
          )}
        </View>
      ) : null}
      {message !== '' && (
        <Notice message={message} actionLabel="Try again" onAction={() => load(retryPage.current)} disabled={busy} />
      )}
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        selected
          ? { backgroundColor: theme.accent, borderColor: theme.accent }
          : { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}>
      <Text style={[styles.chipText, { color: selected ? theme.onAccent : theme.text }]}>{label}</Text>
    </PressScale>
  );
}

type Point = { icon: SymbolViewProps['name']; title: string; body: string };

const steps: Point[] = [
  {
    icon: { ios: 'magnifyingglass', android: 'search', web: 'search' },
    title: 'Pick a shop',
    body: 'Find a shop you already use and choose how much to spend.',
  },
  {
    icon: { ios: 'hand.tap', android: 'touch_app', web: 'touch_app' },
    title: 'Pay in a tap',
    body: 'Pay from your Loop balance. You see the exact price and your cashback first.',
  },
  {
    icon: { ios: 'bolt.fill', android: 'bolt', web: 'bolt' },
    title: 'Get your card instantly',
    body: 'Your card number and PIN appear in Loop, ready to use in store or online.',
  },
  {
    icon: { ios: 'arrow.uturn.backward', android: 'replay', web: 'replay' },
    title: 'Cashback lands',
    body: 'Cashback goes into your balance. Spend it on your next card or put it in savings.',
  },
];

const benefits: Point[] = [
  {
    icon: { ios: 'bolt.fill', android: 'bolt', web: 'bolt' },
    title: 'Instant delivery',
    body: 'Your gift card is in Loop as soon as you pay. No waiting for an email.',
  },
  {
    icon: { ios: 'banknote', android: 'payments', web: 'payments' },
    title: 'Cashback on every card',
    body: 'Real money back in your balance, not points that expire.',
  },
  {
    icon: { ios: 'leaf.fill', android: 'savings', web: 'savings' },
    title: 'Savings that earn',
    body: `Move your cashback to savings. ${Savings.rateHeadline}.`,
  },
  {
    icon: { ios: 'lock.shield', android: 'verified_user', web: 'verified_user' },
    title: 'Simple, safe sign-in',
    body: 'Sign in with Face ID or your fingerprint, with no password to remember.',
  },
];

export function HowLoopWorks() {
  const { wide } = usePageLayout();
  const theme = useTheme();
  return (
    <>
      <View style={[styles.band, { backgroundColor: theme.backgroundSubtle }]}>
        <PageWidth style={styles.bandInner}>
          <View style={styles.bandHeading}>
            <Text style={[styles.bandTitle, { color: theme.text }]} accessibilityRole="header">
              How Loop works
            </Text>
            <Text style={[styles.bandLine, { color: theme.textSecondary }]}>
              From picking a shop to cashback in your balance, in four steps.
            </Text>
          </View>
          <View style={[styles.steps, wide && styles.stepsWide]}>
            {steps.map((step, index) => (
              <View
                key={step.title}
                style={[
                  styles.step,
                  wide && styles.stepWide,
                  Elevation.card,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ]}>
                <View style={styles.stepTop}>
                  <View style={[styles.stepIcon, { backgroundColor: theme.accentSoft }]}>
                    <SymbolView name={step.icon} size={22} tintColor={theme.accent} />
                  </View>
                  <Text style={[styles.stepNumber, { color: theme.borderStrong }]}>{index + 1}</Text>
                </View>
                <Text style={[styles.stepTitle, { color: theme.text }]}>{step.title}</Text>
                <Text style={[styles.stepBody, { color: theme.textSecondary }]}>{step.body}</Text>
              </View>
            ))}
          </View>
        </PageWidth>
      </View>
      <WhyShopWithLoop />
    </>
  );
}

export function WhyShopWithLoop() {
  const { wide } = usePageLayout();
  const theme = useTheme();
  return (
    <PageWidth style={styles.bandInner}>
      <View style={styles.bandHeading}>
        <Text style={[styles.bandTitle, { color: theme.text }]} accessibilityRole="header">
          Why shop with Loop
        </Text>
        <Text style={[styles.bandLine, { color: theme.textSecondary }]}>
          The shops you love, with money back every time.
        </Text>
      </View>
      <View style={[styles.benefits, wide && styles.benefitsWide]}>
        {benefits.map((benefit) => (
          <View key={benefit.title} style={[styles.benefit, wide && styles.benefitWide]}>
            <SymbolView name={benefit.icon} size={28} tintColor={theme.accent} />
            <View style={styles.benefitText}>
              <Text style={[styles.stepTitle, { color: theme.text }]}>{benefit.title}</Text>
              <Text style={[styles.stepBody, { color: theme.textSecondary }]}>{benefit.body}</Text>
            </View>
          </View>
        ))}
      </View>
    </PageWidth>
  );
}

export function SiteFooter() {
  const theme = useTheme();
  const { wide } = usePageLayout();
  return (
    <Animated.View entering={FadeIn} style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.backgroundSubtle }]}>
      <PageWidth style={[styles.footerInner, wide && styles.footerInnerWide]}>
        <Wordmark height={18} />
        <View style={styles.footerLinks}>
          <ExternalLink href={loopLinks.terms}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.footerLink}>
              Terms
            </ThemedText>
          </ExternalLink>
          <ExternalLink href={loopLinks.privacy}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.footerLink}>
              Privacy Policy
            </ThemedText>
          </ExternalLink>
          <ThemedText type="small" themeColor="textSecondary">
            © {new Date().getFullYear()} Loop
          </ThemedText>
        </View>
      </PageWidth>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: Layout.pageMaxWidth,
    alignSelf: 'center',
  },
  heroInner: {
    paddingTop: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.five,
  },
  heroInnerWide: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Spacing.six,
    paddingBottom: Spacing.six,
    gap: Spacing.six,
  },
  hero: {
    zIndex: 1,
  },
  heroCopy: {
    gap: Spacing.four,
    zIndex: 2,
  },
  heroCopyWide: {
    flex: 1.25,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headline: {
    fontFamily: FontFamily.bold,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1,
  },
  headlineWide: {
    fontSize: 68,
    lineHeight: 70,
    letterSpacing: -2.4,
    maxWidth: 640,
  },
  heroLine: {
    fontFamily: FontFamily.medium,
    fontSize: 17,
    lineHeight: 25,
    maxWidth: 540,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    minHeight: 48,
    width: '100%',
  },
  searchLarge: {
    minHeight: 56,
    maxWidth: 560,
    paddingHorizontal: Spacing.four,
  },
  searchInput: {
    flex: 1,
    alignSelf: 'stretch',
    fontFamily: FontFamily.regular,
    fontSize: 16,
    outlineWidth: 0,
  },
  merchantSearch: {
    width: '100%',
  },
  merchantSearchLarge: {
    maxWidth: 560,
  },
  merchantSearchOpen: {
    zIndex: 20,
  },
  suggestions: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.card,
    padding: Spacing.one,
    overflow: 'hidden',
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 52,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.control,
  },
  suggestionLogo: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionLogoImage: {
    width: '72%',
    height: '72%',
  },
  suggestionInitial: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionInitialText: {
    color: '#FFFFFF',
    fontFamily: FontFamily.semibold,
    fontSize: 15,
  },
  suggestionName: {
    flex: 1,
    fontFamily: FontFamily.medium,
    fontSize: 15,
  },
  suggestionRate: {
    fontFamily: FontFamily.semibold,
    fontSize: 13,
  },
  searchInputLarge: {
    fontSize: 18,
  },
  heroPhotoWrap: {
    alignSelf: 'center',
    width: '78%',
    maxWidth: 320,
    paddingBottom: Spacing.four,
  },
  heroPhotoWrapWide: {
    flex: 0.85,
    width: undefined,
    maxWidth: 440,
    paddingBottom: 0,
  },
  heroPhoto: {
    aspectRatio: 1,
    borderRadius: 32,
    borderWidth: 6,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    transform: [{ rotate: '4deg' }],
  },
  heroPhotoWide: {
    borderRadius: 40,
    borderWidth: 8,
  },
  heroPhotoImage: {
    width: '100%',
    height: '100%',
  },
  heroOffer: {
    position: 'absolute',
    left: -Spacing.four,
    bottom: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingLeft: Spacing.two,
    paddingRight: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 1,
    maxWidth: 260,
    transform: [{ rotate: '-3deg' }],
  },
  heroOfferWide: {
    left: -Spacing.five,
    bottom: Spacing.five,
  },
  heroOfferLogo: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    padding: Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroOfferLogoImage: {
    width: '100%',
    height: '100%',
  },
  heroOfferInitial: {
    fontFamily: FontFamily.bold,
    fontSize: 18,
  },
  heroOfferText: {
    flexShrink: 1,
  },
  heroOfferName: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    lineHeight: 16,
  },
  heroOfferRate: {
    fontFamily: FontFamily.bold,
    fontSize: 17,
    lineHeight: 22,
    fontVariant: ['tabular-nums'],
  },
  section: {
    gap: Spacing.four,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.four,
  },
  sectionHeadingText: {
    flexShrink: 1,
    gap: Spacing.one,
  },
  catalogSearch: {
    width: 320,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -Spacing.two,
    rowGap: Spacing.four,
  },
  cell: {
    paddingHorizontal: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  chipText: {
    fontFamily: FontFamily.medium,
    fontSize: 14,
  },
  empty: {
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  inlineButton: {
    alignSelf: 'flex-start',
    paddingTop: Spacing.two,
  },
  band: {
    width: '100%',
  },
  bandInner: {
    paddingVertical: Spacing.six,
    gap: Spacing.five,
  },
  bandTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.8,
  },
  bandHeading: {
    gap: Spacing.two,
  },
  bandLine: {
    fontFamily: FontFamily.medium,
    fontSize: 17,
    lineHeight: 25,
    maxWidth: 540,
  },
  steps: {
    gap: Spacing.three,
  },
  stepsWide: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
  step: {
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Radius.card,
    borderWidth: 1,
  },
  stepWide: {
    flex: 1,
  },
  stepTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  stepIcon: {
    width: 48,
    height: 48,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    fontFamily: FontFamily.bold,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  stepTitle: {
    fontFamily: FontFamily.semibold,
    fontSize: 20,
    lineHeight: 26,
  },
  stepBody: {
    fontFamily: FontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 360,
  },
  benefits: {
    gap: Spacing.four,
  },
  benefitsWide: {
    flexDirection: 'row',
    gap: Spacing.five,
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  benefitWide: {
    flex: 1,
    flexDirection: 'column',
  },
  benefitText: {
    flex: 1,
    gap: Spacing.one,
  },
  footer: {
    borderTopWidth: 1,
  },
  footerInner: {
    paddingVertical: Spacing.five,
    gap: Spacing.four,
  },
  footerInnerWide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.four,
  },
  footerLink: {
    textDecorationLine: 'underline',
  },
});
