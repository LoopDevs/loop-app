import { Image } from 'expo-image';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';

import { ExternalLink } from '@/components/external-link';
import { Button, Notice } from '@/components/form';
import { MerchantTile } from '@/components/merchant-tile';
import { PressScale } from '@/components/press-scale';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Wordmark } from '@/components/wordmark';
import { loopLinks } from '@/constants/loop-links';
import { Brand, FontFamily, Layout, Motion, Radius, Spacing } from '@/constants/theme';
import { ctx } from '@/ctx/client';
import { Market } from '@/ctx/market';
import { Merchant } from '@/ctx/merchant';
import { useBusyAction } from '@/hooks/use-busy-action';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useTheme } from '@/hooks/use-theme';

const catalogScanSize = 500;
const boardSize = 5;
const catalogPageSize = 24;
const searchDelayMs = 300;
const tileHeight = 140;

export type Catalog = {
  top: Merchant[];
  categories: string[];
  total: number;
};

const catalogRequests = new Map<string, Promise<Catalog>>();
const loadedCatalogs = new Map<string, Catalog>();

function loadCatalog(country: string): Promise<Catalog> {
  const pending = catalogRequests.get(country);
  if (pending) {
    return pending;
  }
  const request = ctx
    .merchants({ country, perPage: catalogScanSize })
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
  const best = catalog?.top[0];
  return (
    <View style={styles.hero}>
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
          <Text style={[styles.headline, wide && styles.headlineWide]} accessibilityRole="header">
            Gift cards that pay you back.
          </Text>
          <Text style={styles.heroLine} maxFontSizeMultiplier={1.6}>
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
  if (merchants !== null && merchants.length === 0) {
    return null;
  }
  return (
    <View style={styles.board}>
      <Text style={styles.boardTitle}>Highest cashback</Text>
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
          <View key={`placeholder-${index}`} style={styles.boardRow}>
            <View style={styles.boardPlaceholder} />
          </View>
        ),
      )}
    </View>
  );
}

function BoardRow({ merchant, onPress }: { merchant: Merchant; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${merchant.name}, ${merchant.rateLabel()}`}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
        styles.boardRow,
        (hovered || pressed) && styles.boardRowActive,
      ]}>
      <View style={styles.boardLogo}>
        {merchant.logoUrl ? (
          <Image source={{ uri: merchant.logoUrl }} contentFit="contain" style={styles.boardLogoImage} />
        ) : (
          <Text style={styles.boardInitial}>{merchant.initial()}</Text>
        )}
      </View>
      <Text style={styles.boardName} numberOfLines={1}>
        {merchant.name}
      </Text>
      <Text style={styles.boardRate}>{merchant.rateFigure()}</Text>
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
            <MerchantTile merchant={merchant} onPress={() => onOpen(merchant)} />
          ) : (
            <Skeleton width="100%" height={tileHeight} />
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
        if (next === 1) {
          setPage(0);
        }
        const { result, pagination } = await ctx.merchants({
          country,
          name: query,
          category: category ?? undefined,
          page: next,
          perPage: catalogPageSize,
        });
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
  return (
    <View style={styles.band}>
      <PageWidth style={styles.bandInner}>
        <Text style={styles.bandTitle} accessibilityRole="header">
          How Loop works
        </Text>
        <View style={[styles.steps, wide && styles.stepsWide]}>
          {steps.map((step) => (
            <View key={step.title} style={[styles.step, wide && styles.stepWide]}>
              <View style={styles.stepIcon}>
                <SymbolView name={step.icon} size={22} tintColor={Brand.onRoyal} />
              </View>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepBody}>{step.body}</Text>
            </View>
          ))}
        </View>
        <View style={styles.rule} />
        <View style={[styles.trust, wide && styles.trustWide]}>
          {trust.map((line) => (
            <View key={line} style={styles.trustItem}>
              <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={16} tintColor={Brand.onRoyalMuted} />
              <Text style={styles.trustText}>{line}</Text>
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
    <Animated.View entering={FadeIn} style={[styles.footer, { borderTopColor: theme.border }]}>
      <PageWidth style={[styles.footerInner, wide && styles.footerInnerWide]}>
        <Wordmark height={18} color={theme.text} />
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
  hero: {
    backgroundColor: Brand.royal,
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
    color: Brand.onRoyal,
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
    color: Brand.onRoyalMuted,
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
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.three,
    minHeight: 48,
    width: '100%',
  },
  searchLarge: {
    minHeight: 60,
    maxWidth: 560,
    borderWidth: 0,
    boxShadow: '0 12px 32px rgba(10, 22, 64, 0.32)',
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
    backgroundColor: Brand.navy,
    borderRadius: Radius.control,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    boxShadow: '0 24px 48px rgba(10, 22, 64, 0.4)',
  },
  boardTitle: {
    color: Brand.onRoyalMuted,
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
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: Radius.tile,
    transitionProperty: 'background-color',
    transitionDuration: `${Motion.feedback}ms`,
  },
  boardRowActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  boardPlaceholder: {
    flex: 1,
    height: 20,
    borderRadius: Radius.tile,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  boardLogo: {
    width: 40,
    height: 40,
    borderRadius: Radius.tile,
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
    color: Brand.navy,
    fontFamily: FontFamily.bold,
    fontSize: 18,
  },
  boardName: {
    flex: 1,
    color: Brand.onRoyal,
    fontFamily: FontFamily.medium,
    fontSize: 17,
  },
  boardRate: {
    color: Brand.onRoyal,
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
    borderRadius: Radius.control,
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
    backgroundColor: Brand.navy,
  },
  bandInner: {
    paddingVertical: Spacing.six,
    gap: Spacing.five,
  },
  bandTitle: {
    color: Brand.onRoyal,
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
    borderRadius: Radius.control,
    backgroundColor: Brand.royal,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  stepTitle: {
    color: Brand.onRoyal,
    fontFamily: FontFamily.semibold,
    fontSize: 20,
    lineHeight: 26,
  },
  stepBody: {
    color: Brand.onRoyalMuted,
    fontFamily: FontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 360,
  },
  rule: {
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
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
    color: Brand.onRoyalMuted,
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
