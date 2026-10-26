import { Image } from 'expo-image';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { Market } from '@/ctx/market';
import { Merchant } from '@/ctx/merchant';
import { useBusyAction } from '@/hooks/use-busy-action';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useTheme } from '@/hooks/use-theme';

const catalogScanSize = 500;
const boardSize = 5;
const catalogPageSize = 24;
const searchDelayMs = 300;
const cardHeight = 230;

export type Catalog = {
  top: Merchant[];
  categories: string[];
  total: number;
};

const catalogRequests = new Map<string, Promise<Catalog>>();
const loadedCatalogs = new Map<string, Catalog>();
const loadedMerchants = new Map<string, Merchant>();
const loadedPages = new Map<string, MerchantPage>();

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
  loadedPages.set(pageKey(query), loaded);
  return loaded;
}

export function loadCatalog(country: string): Promise<Catalog> {
  const pending = catalogRequests.get(country);
  if (pending) {
    return pending;
  }
  const request = loadMerchantPage({ country, perPage: catalogScanSize })
    .then(({ result, pagination }) => {
      const catalog = {
        top: Merchant.byCashback(result).filter((merchant) => merchant.cashbackBasisPoints() > 0),
        categories: Merchant.categoriesOf(result),
        total: pagination.total,
      };
      loadedCatalogs.set(country, catalog);
      return catalog;
    })
    .catch(() => {
      catalogRequests.delete(country);
      return { top: [], categories: [], total: 0 };
    });
  catalogRequests.set(country, request);
  return request;
}

export function useCatalog(country: string | undefined) {
  const [loaded, setLoaded] = useState<{ country: string; catalog: Catalog } | null>(() => {
    const cached = country ? loadedCatalogs.get(country) : undefined;
    return country && cached ? { country, catalog: cached } : null;
  });
  useEffect(() => {
    if (!country) {
      return;
    }
    let current = true;
    loadCatalog(country).then((catalog) => current && setLoaded({ country, catalog }));
    return () => {
      current = false;
    };
  }, [country]);
  return loaded && loaded.country === country ? loaded.catalog : null;
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
    <View>
      <PageWidth style={[styles.heroInner, wide && styles.heroInnerWide]}>
        <Animated.View
          entering={reduceMotion ? undefined : FadeInDown.duration(Motion.transition).easing(Motion.easeOut)}
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
              ? `Buy gift cards for the shops you already use and earn up to ${best.rateFigure()} cashback in ${Market.countryName(country)}.`
              : 'Buy gift cards for the shops you already use and earn cashback on every card.'}
          </Text>
          <SearchBar value={search} onChangeText={onSearch} onSubmit={onSubmitSearch} large />
        </Animated.View>
        {wide && <RateBoard merchants={catalog ? catalog.top.slice(0, boardSize) : null} onOpen={onOpen} />}
      </PageWidth>
    </View>
  );
}

type SearchBarProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit?: () => void;
  large?: boolean;
  placeholder?: string;
};

export function SearchBar({ value, onChangeText, onSubmit, large = false, placeholder = 'Search gift cards' }: SearchBarProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.search,
        large && styles.searchLarge,
        large && Elevation.raised,
        { backgroundColor: theme.backgroundElement, borderColor: focused ? theme.accent : theme.border },
        focused && styles.searchFocused,
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
        placeholder={placeholder}
        accessibilityLabel={placeholder}
        placeholderTextColor={theme.textSecondary}
        selectionColor={theme.accent}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
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

function RateBoard({ merchants, onOpen }: { merchants: Merchant[] | null; onOpen: (merchant: Merchant) => void }) {
  const reduceMotion = useReducedMotion();
  const theme = useTheme();
  if (merchants !== null && merchants.length === 0) {
    return null;
  }
  return (
    <View
      style={[styles.board, Elevation.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <Text style={[styles.boardTitle, { color: theme.textSecondary }]}>Highest cashback</Text>
      {(merchants ?? Array.from({ length: boardSize }, () => null)).map((merchant, index) =>
        merchant ? (
          <Animated.View
            key={merchant.id}
            entering={
              reduceMotion
                ? undefined
                : FadeInDown.duration(Motion.state).delay(index * Motion.stagger).easing(Motion.easeOut)
            }>
            <BoardRow merchant={merchant} onPress={() => onOpen(merchant)} />
          </Animated.View>
        ) : (
          <View key={`placeholder-${index}`} style={[styles.boardRow, { borderTopColor: theme.border }]}>
            <View style={[styles.boardPlaceholder, { backgroundColor: theme.backgroundSubtle }]} />
          </View>
        ),
      )}
    </View>
  );
}

function BoardRow({ merchant, onPress }: { merchant: Merchant; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${merchant.name}, ${merchant.rateLabel()}`}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
        styles.boardRow,
        { borderTopColor: theme.border },
        (hovered || pressed) && { backgroundColor: theme.backgroundSubtle },
      ]}>
      <View style={[styles.boardLogo, { borderColor: theme.border }]}>
        {merchant.logoUrl ? (
          <Image source={{ uri: merchant.logoUrl }} contentFit="contain" style={styles.boardLogoImage} />
        ) : (
          <Text style={[styles.boardInitial, { color: theme.text }]}>{merchant.initial()}</Text>
        )}
      </View>
      <Text style={[styles.boardName, { color: theme.text }]} numberOfLines={1}>
        {merchant.name}
      </Text>
      <Text style={[styles.boardRate, { color: theme.accent }]}>{merchant.rateFigure()}</Text>
    </Pressable>
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
  categories: string[];
  search: string;
  onSearch: (text: string) => void;
  onOpen: (merchant: Merchant) => void;
};

export function MerchantCatalog({ country, categories, search, onSearch, onOpen }: CatalogProps) {
  const { wide } = usePageLayout();
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
        setMerchants((shown) => (next === 1 ? result : [...shown, ...result]));
        setPage(next);
        setPages(pagination.pages);
        setTotal(pagination.total);
      }),
    [run, country, query, category],
  );

  useEffect(() => {
    load(1);
  }, [load]);

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
        <MerchantGrid merchants={merchants} onOpen={onOpen} />
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
      {page > 0 && page < pages && (
        <View style={styles.more}>
          <Button
            label={busy ? 'Loading gift cards…' : 'Show more gift cards'}
            onPress={() => load(page + 1)}
            disabled={busy}
          />
        </View>
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

type Step = { icon: SymbolViewProps['name']; title: string; body: string };

const steps: Step[] = [
  {
    icon: { ios: 'magnifyingglass', android: 'search', web: 'search' },
    title: 'Pick a gift card',
    body: 'Choose from the shops you already use and the amount you want to spend.',
  },
  {
    icon: { ios: 'wallet.pass', android: 'account_balance_wallet', web: 'account_balance_wallet' },
    title: 'Pay from your balance',
    body: 'Pay from your Loop balance. Your card number and PIN appear in Loop when it is ready.',
  },
  {
    icon: { ios: 'arrow.uturn.backward', android: 'replay', web: 'replay' },
    title: 'Earn cashback',
    body: 'Cashback from every card goes straight into your balance, where your savings grow.',
  },
];

const trust = [
  'Sign in with Face ID or your fingerprint, with no password to remember',
  'Cashback is real money in your balance, not points',
  'Exact prices and cashback shown before you pay',
];

export function HowLoopWorks() {
  const { wide } = usePageLayout();
  const theme = useTheme();
  return (
    <View style={[styles.band, { backgroundColor: theme.backgroundSubtle }]}>
      <PageWidth style={styles.bandInner}>
        <Text style={[styles.bandTitle, { color: theme.text }]} accessibilityRole="header">
          How Loop works
        </Text>
        <View style={[styles.steps, wide && styles.stepsWide]}>
          {steps.map((step) => (
            <View key={step.title} style={[styles.step, wide && styles.stepWide]}>
              <View style={[styles.stepIcon, { backgroundColor: theme.accentSoft }]}>
                <SymbolView name={step.icon} size={22} tintColor={theme.accent} />
              </View>
              <Text style={[styles.stepTitle, { color: theme.text }]}>{step.title}</Text>
              <Text style={[styles.stepBody, { color: theme.textSecondary }]}>{step.body}</Text>
            </View>
          ))}
        </View>
        <View style={[styles.rule, { backgroundColor: theme.border }]} />
        <View style={[styles.trust, wide && styles.trustWide]}>
          {trust.map((line) => (
            <View key={line} style={styles.trustItem}>
              <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={16} tintColor={theme.success} />
              <Text style={[styles.trustText, { color: theme.textSecondary }]}>{line}</Text>
            </View>
          ))}
        </View>
      </PageWidth>
    </View>
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
  heroCopy: {
    gap: Spacing.four,
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
  searchFocused: {
    outlineWidth: 0,
  },
  searchInput: {
    flex: 1,
    alignSelf: 'stretch',
    fontFamily: FontFamily.regular,
    fontSize: 16,
    outlineWidth: 0,
  },
  searchInputLarge: {
    fontSize: 18,
  },
  board: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.card,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
  },
  boardTitle: {
    fontFamily: FontFamily.semibold,
    fontSize: 13,
    lineHeight: 16,
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.two,
  },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 64,
    paddingHorizontal: Spacing.two,
    borderTopWidth: 1,
    borderRadius: Radius.tile,
    transitionProperty: 'background-color',
    transitionDuration: `${Motion.feedback}ms`,
  },
  boardPlaceholder: {
    flex: 1,
    height: 20,
    borderRadius: Radius.tile,
  },
  boardLogo: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    padding: Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardLogoImage: {
    width: '100%',
    height: '100%',
  },
  boardInitial: {
    fontFamily: FontFamily.bold,
    fontSize: 18,
  },
  boardName: {
    flex: 1,
    fontFamily: FontFamily.medium,
    fontSize: 17,
  },
  boardRate: {
    fontFamily: FontFamily.semibold,
    fontSize: 30,
    letterSpacing: -0.8,
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
  more: {
    alignSelf: 'center',
    minWidth: 240,
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
  steps: {
    gap: Spacing.five,
  },
  stepsWide: {
    flexDirection: 'row',
  },
  step: {
    gap: Spacing.two,
  },
  stepWide: {
    flex: 1,
  },
  stepIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
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
  rule: {
    height: 1,
  },
  trust: {
    gap: Spacing.three,
  },
  trustWide: {
    flexDirection: 'row',
    gap: Spacing.five,
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexShrink: 1,
  },
  trustText: {
    fontFamily: FontFamily.medium,
    fontSize: 15,
    lineHeight: 20,
    flexShrink: 1,
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
