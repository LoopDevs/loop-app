import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { Image } from 'expo-image';
import { useCallback, useRef, useState } from 'react';
import { Platform, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddDevice } from '@/components/add-device';
import { CountryMenu } from '@/components/country-menu';
import { Button, Notice } from '@/components/form';
import { HomeActions } from '@/components/home-actions';
import { NextStep, RecentGiftCards } from '@/components/home-overview';
import { BalanceCard, StatusBarScrim, useScrimScroll } from '@/components/home-panel';
import {
  coverClearance,
  MerchantCard,
  MerchantCardStrip,
  MerchantCover,
  SectionHeading,
} from '@/components/merchant-card';
import { PressScale } from '@/components/press-scale';
import { SignInButton, useOnSignIn, useSignIn } from '@/components/sign-in';
import { SiteFooter } from '@/components/site-footer';
import { Skeleton } from '@/components/skeleton';
import {
  HowLoopWorks,
  PageWidth,
  StorefrontHero,
  useCatalog,
  type Catalog,
} from '@/components/storefront';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, FontFamily, Layout, Motion, Radius, Spacing } from '@/constants/theme';
import { ctx } from '@/ctx/client';
import type { Merchant } from '@/ctx/merchant';
import { useAppRefresh } from '@/hooks/use-app-refresh';
import { errorMessage, useBusyAction } from '@/hooks/use-busy-action';
import { useHoldings } from '@/hooks/use-holdings';
import { useMarket } from '@/hooks/use-market';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useTheme } from '@/hooks/use-theme';
import { Savings } from '@/wallet/savings';
import { SmartWallet, UnlinkedDevice } from '@/wallet/smart-wallet';

type Screen = 'loading' | 'signed-out' | 'no-wallet' | 'unlinked-device' | 'wallet';

const featuredShown = 5;
const stripShown = 10;
const brandRows = 2;
const maxBrandColumns = 6;
const offersShown = featuredShown + Math.max(stripShown, maxBrandColumns * brandRows);

const preWalletScreens: Screen[] = ['loading', 'signed-out'];

export default function HomeScreen() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>(Platform.OS === 'web' ? 'signed-out' : 'loading');
  const [wallet, setWallet] = useState<SmartWallet | null>(null);
  const [unlinkedWallet, setUnlinkedWallet] = useState<SmartWallet | null>(null);
  const [profileCountry, setProfileCountry] = useState<string | undefined>(undefined);
  const [sessionRead, setSessionRead] = useState(false);
  const { view, refresh } = useHoldings(wallet);
  const { busy, message, setMessage, run } = useBusyAction();
  const [refreshing, setRefreshing] = useState(false);
  const [giftCardsRefreshKey, setGiftCardsRefreshKey] = useState(0);
  const [search, setSearch] = useState('');
  const walletLoadStarted = useRef(false);
  const homeFocused = useRef(false);
  const { wide } = usePageLayout();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { country: marketCountry, resolved: marketResolved } = useMarket();
  const { check } = useSignIn();
  const signedOut = screen === 'signed-out';
  const signedOutCountry = marketResolved ? marketCountry : undefined;
  const catalogCountry = !sessionRead ? undefined : signedOut ? signedOutCountry : profileCountry;
  const catalog = useCatalog(catalogCountry, offersShown);

  const showWallet = useCallback((loaded: SmartWallet | null) => {
    setWallet(loaded);
    setScreen(loaded ? 'wallet' : 'no-wallet');
  }, []);

  const openActiveOrder = useCallback(async () => {
    const activeOrder = await ctx.activeGiftCard().catch(() => null);
    if (activeOrder && homeFocused.current) {
      router.push(`/shop/${activeOrder.merchantId}`, { withAnchor: true });
    }
  }, [router]);

  const loadWallet = useCallback(async () => {
    walletLoadStarted.current = true;
    try {
      const loaded = await SmartWallet.load();
      await Promise.all([showWallet(loaded), loaded && Platform.OS !== 'web' ? openActiveOrder() : undefined]);
    } catch (error) {
      if (error instanceof UnlinkedDevice) {
        setUnlinkedWallet(error.wallet);
        setScreen('unlinked-device');
        return;
      }
      walletLoadStarted.current = false;
      setScreen('no-wallet');
      throw error;
    }
  }, [showWallet, openActiveOrder]);

  const loadProfileCountry = useCallback(async () => {
    const profile = await ctx.me().catch(() => null);
    setProfileCountry(profile && !profile.needsSetup() ? profile.country : undefined);
  }, []);

  const readSession = useCallback(async () => {
    try {
      const signedIn = await ctx.isSignedIn();
      setSessionRead(true);
      if (signedIn) {
        if (preWalletScreens.includes(screen) && !walletLoadStarted.current) {
          setScreen('loading');
          loadProfileCountry();
          await loadWallet();
        }
        return;
      }
      walletLoadStarted.current = false;
      setWallet(null);
      setScreen('signed-out');
      check();
    } catch (error) {
      walletLoadStarted.current = false;
      setMessage(errorMessage(error));
    }
  }, [screen, loadWallet, loadProfileCountry, setMessage, check]);

  useFocusEffect(
    useCallback(() => {
      homeFocused.current = true;
      readSession();
      return () => {
        homeFocused.current = false;
      };
    }, [readSession]),
  );
  useOnSignIn(readSession);

  const createWallet = () =>
    run(async () => {
      const profile = await ctx.me();
      await SmartWallet.create(profile.passkeyLabel());
      setScreen('loading');
      await loadWallet();
    });

  const refreshBalances = useCallback(async () => {
    if (!wallet) {
      return;
    }
    try {
      await refresh();
      setMessage('');
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }, [wallet, refresh, setMessage]);

  useFocusEffect(
    useCallback(() => {
      refreshBalances();
    }, [refreshBalances]),
  );
  useAppRefresh(refreshBalances);

  const pullToRefresh = async () => {
    setRefreshing(true);
    setGiftCardsRefreshKey((key) => key + 1);
    await refreshBalances();
    setRefreshing(false);
  };

  const { scrollRef, onScroll, scrim } = useScrimScroll();
  const addMoney = () => router.navigate({ pathname: '/wallet', params: { add: '1' } });
  const openShop = () => router.navigate('/shop');
  const searchShop = () => {
    const q = search.trim();
    if (q) {
      router.navigate({ pathname: '/shop', params: { q } });
    }
  };

  const openMerchant = (merchant: Merchant) => router.push(`/shop/${merchant.slug}`);
  const topMerchant = catalog?.top[0] ?? null;
  const showsListings = signedOut || catalogCountry !== undefined;

  return (
    <ThemedView style={styles.container}>
      <StatusBar style="dark" />
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          screen === 'wallet' ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={pullToRefresh}
              tintColor={theme.textSecondary}
              colors={[theme.accent]}
              progressViewOffset={insets.top}
            />
          ) : undefined
        }>
        <StorefrontHero
          catalog={catalog}
          country={catalogCountry ?? marketCountry}
          search={search}
          onSearch={setSearch}
          onSubmitSearch={searchShop}
          onOpen={openMerchant}
          accessory={
            wide || !signedOut ? null : (
              <View style={styles.heroActions}>
                <CountryMenu />
                <SignInButton />
              </View>
            )
          }
        />

        <PageWidth style={styles.body}>
          {screen === 'no-wallet' && (
            <Animated.View entering={FadeIn.duration(Motion.state)} style={[styles.sheet, styles.form]}>
              <ThemedText type="subtitle">Finish setting up Loop</ThemedText>
              <ThemedText themeColor="textSecondary">
                Turn on Face ID or your fingerprint to keep your balance and cashback safe, with no password to
                remember.
              </ThemedText>
              <Button
                label={busy ? 'Setting up…' : 'Turn on Face ID or fingerprint'}
                variant="primary"
                onPress={createWallet}
                disabled={busy}
              />
            </Animated.View>
          )}

          {screen === 'unlinked-device' && unlinkedWallet && (
            <AddDevice wallet={unlinkedWallet} onAdded={loadWallet} />
          )}

          {message !== '' && (
            <Notice
              message={message}
              actionLabel={sessionRead ? undefined : 'Try again'}
              onAction={() => run(readSession)}
              disabled={busy}
            />
          )}

          {showsListings && <FeaturedOffers catalog={catalog} onOpen={openMerchant} onSeeAll={openShop} />}

          {showsListings && (
            <MerchantCardStrip
              title="More cashback offers"
              merchants={catalog?.top.slice(featuredShown, featuredShown + stripShown) ?? []}
              onOpen={openMerchant}
              onSeeAll={openShop}
            />
          )}

          {screen === 'loading' && sessionRead && (
            <View style={styles.section}>
              <SectionHeading title="Your Loop" />
              <BalanceCard view={null} />
            </View>
          )}

          {screen === 'wallet' && wallet && (
            <View style={styles.section}>
              <SectionHeading title="Your Loop" />
              <View style={[styles.overview, wide && styles.overviewWide]}>
                <View style={[styles.column, wide && styles.columnWide]}>
                  <BalanceCard view={view}>
                    <HomeActions
                      onAddMoney={addMoney}
                      onShop={openShop}
                      onSavings={() => router.navigate('/savings')}
                      onCashOut={() => router.push('/wallet/cash-out')}
                    />
                  </BalanceCard>
                  <SavingsNudge onPress={() => router.navigate('/savings')} />
                </View>
                <View style={[styles.column, wide && styles.columnWide]}>
                  <NextStep view={view} topMerchant={topMerchant} onAddMoney={addMoney} onOpenMerchant={openMerchant} />
                  <RecentGiftCards
                    refreshKey={giftCardsRefreshKey}
                    onOpenOrder={(id) => router.push(`/wallet/${id}`)}
                    onSeeAll={() => router.navigate('/wallet')}
                    onShop={openShop}
                  />
                </View>
              </View>
            </View>
          )}

          {showsListings && <BrandWall catalog={catalog} onOpen={openMerchant} onSeeAll={openShop} />}

          {showsListings && (
            <View style={styles.browseAll}>
              <Button label="Browse all gift cards" variant="primary" onPress={openShop} />
            </View>
          )}
        </PageWidth>
        {signedOut && <HowLoopWorks />}
        <SiteFooter />
      </Animated.ScrollView>
      <StatusBarScrim style={scrim} />
    </ThemedView>
  );
}

type ListingProps = {
  catalog: Catalog | null;
  onOpen: (merchant: Merchant) => void;
  onSeeAll: () => void;
};

function FeaturedOffers({ catalog, onOpen, onSeeAll }: ListingProps) {
  const { wide } = usePageLayout();
  if (catalog && catalog.top.length === 0) {
    return null;
  }
  const [lead, ...rest] = catalog
    ? catalog.top.slice(0, featuredShown)
    : Array.from({ length: featuredShown }, () => null);
  return (
    <View style={styles.section}>
      <SectionHeading title="Top cashback right now" onSeeAll={onSeeAll} />
      <View style={[styles.featured, wide && styles.featuredWide]}>
        <View style={wide && styles.featuredLead}>
          {lead ? <LeadOffer merchant={lead} onPress={() => onOpen(lead)} /> : <Skeleton width="100%" aspectRatio={16 / 10} />}
        </View>
        <View style={[styles.featuredGrid, wide && styles.featuredGridWide]}>
          {rest.map((merchant, index) => (
            <View key={merchant ? merchant.id : `placeholder-${index}`} style={styles.featuredCell}>
              {merchant ? (
                <MerchantCard merchant={merchant} onPress={() => onOpen(merchant)} />
              ) : (
                <Skeleton width="100%" aspectRatio={16 / 10} />
              )}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function LeadOffer({ merchant, onPress }: { merchant: Merchant; onPress: () => void }) {
  return (
    <PressScale onPress={onPress} accessibilityRole="button" accessibilityLabel={`${merchant.name}, ${merchant.rateLabel()}`}>
      <MerchantCover merchant={merchant} size="hero" />
      <View style={[styles.leadText, { paddingTop: coverClearance('hero') }]}>
        <ThemedText type="subtitle" numberOfLines={1}>
          {merchant.name}
        </ThemedText>
        <ThemedText themeColor="textSecondary" numberOfLines={2}>
          Earn {merchant.rateFigure()} back on every {merchant.name} gift card.
        </ThemedText>
      </View>
    </PressScale>
  );
}

function BrandWall({ catalog, onOpen, onSeeAll }: ListingProps) {
  const { columns } = usePageLayout();
  const theme = useTheme();
  const brandColumns = Math.min(columns + 1, maxBrandColumns);
  const brands = (catalog?.top.slice(featuredShown) ?? [])
    .filter((merchant) => merchant.logoUrl)
    .slice(0, brandColumns * brandRows)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (brands.length === 0) {
    return null;
  }
  return (
    <View style={styles.section}>
      <SectionHeading title="Shop by brand" onSeeAll={onSeeAll} />
      <View style={styles.brandGrid}>
        {brands.map((merchant) => (
          <View key={merchant.id} style={[styles.brandCell, { width: `${100 / brandColumns}%` }]}>
            <PressScale
              onPress={() => onOpen(merchant)}
              accessibilityRole="button"
              accessibilityLabel={`${merchant.name}, ${merchant.rateLabel()}`}
              style={[styles.brandTile, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <View style={[styles.brandLogo, { borderColor: theme.border }]}>
                <Image source={{ uri: merchant.logoUrl }} contentFit="contain" style={styles.brandLogoImage} />
              </View>
              <Text style={[styles.brandName, { color: theme.text }]} numberOfLines={1}>
                {merchant.name}
              </Text>
              <Text style={[styles.brandRate, { color: theme.accent }]} numberOfLines={1}>
                {merchant.rateFigure()} back
              </Text>
            </PressScale>
          </View>
        ))}
      </View>
    </View>
  );
}

function SavingsNudge({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Savings. ${Savings.rateHeadline}. ${Savings.riskShort}.`}
      style={[styles.nudge, { backgroundColor: theme.accentSoft }]}>
      <View style={[styles.nudgeIcon, { backgroundColor: theme.accent }]}>
        <SymbolView name={{ ios: 'leaf', android: 'savings', web: 'savings' }} size={20} tintColor={theme.onAccent} />
      </View>
      <View style={styles.nudgeText}>
        <ThemedText type="smallBold">{Savings.rateHeadline}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Let your cashback grow in savings. {Savings.riskShort}.
        </ThemedText>
      </View>
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
        size={16}
        tintColor={theme.textSecondary}
      />
    </PressScale>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: BottomTabInset,
  },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  body: {
    paddingTop: Spacing.two,
    paddingBottom: Spacing.six,
    gap: Spacing.six,
  },
  section: {
    gap: Spacing.three,
  },
  featured: {
    gap: Spacing.four,
  },
  featuredWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.five,
  },
  featuredLead: {
    flex: 1.2,
    minWidth: 0,
  },
  featuredGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -Spacing.two,
    rowGap: Spacing.four,
  },
  featuredGridWide: {
    flex: 1,
    minWidth: 0,
  },
  featuredCell: {
    width: '50%',
    paddingHorizontal: Spacing.two,
  },
  leadText: {
    paddingHorizontal: Spacing.half,
    gap: Spacing.one,
  },
  brandGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -Spacing.one - Spacing.half,
    rowGap: Spacing.two + Spacing.one,
  },
  brandCell: {
    paddingHorizontal: Spacing.one + Spacing.half,
  },
  brandTile: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.card,
    borderWidth: 1,
  },
  brandLogo: {
    width: 56,
    height: 56,
    borderRadius: Radius.pill,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    padding: Spacing.two,
    marginBottom: Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLogoImage: {
    width: '100%',
    height: '100%',
  },
  brandName: {
    fontFamily: FontFamily.semibold,
    fontSize: 14,
    lineHeight: 18,
    maxWidth: '100%',
  },
  brandRate: {
    fontFamily: FontFamily.bold,
    fontSize: 13,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  browseAll: {
    alignSelf: 'center',
    minWidth: 260,
  },
  overview: {
    gap: Spacing.four,
  },
  overviewWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.five,
  },
  column: {
    gap: Spacing.four,
  },
  columnWide: {
    flex: 1,
    minWidth: 0,
  },
  sheet: {
    gap: Spacing.three,
  },
  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    minHeight: 72,
    borderRadius: Radius.card,
  },
  nudgeIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeText: {
    flex: 1,
    gap: Spacing.half,
  },
  form: {
    maxWidth: Layout.formMaxWidth,
  },
});
