import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useRef, useState } from 'react';
import { Alert, Platform, RefreshControl, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddDevice } from '@/components/add-device';
import { AddMoney } from '@/components/add-money';
import { CountryMenu } from '@/components/country-menu';
import { Button, Notice } from '@/components/form';
import { HomeActions } from '@/components/home-actions';
import { NextStep, RecentGiftCards, SavingsCard, SpendingBalances } from '@/components/home-overview';
import { BalanceHeader, StatusBarScrim, useScrimScroll } from '@/components/home-panel';
import { MerchantCardStrip } from '@/components/merchant-card';
import { SignInButton, useOnSignIn } from '@/components/sign-in';
import {
  HowLoopWorks,
  MerchantCatalog,
  PageWidth,
  SiteFooter,
  StorefrontHero,
  TopCashback,
  useCatalog,
} from '@/components/storefront';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useToast } from '@/components/toast';
import { BottomTabInset, Layout, MaxContentWidth, Motion, Spacing } from '@/constants/theme';
import { ctx } from '@/ctx/client';
import type { Merchant } from '@/ctx/merchant';
import { useAppRefresh } from '@/hooks/use-app-refresh';
import { errorMessage, useBusyAction } from '@/hooks/use-busy-action';
import { useHoldings } from '@/hooks/use-holdings';
import { useMarket } from '@/hooks/use-market';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useTheme } from '@/hooks/use-theme';
import { SmartWallet, UnlinkedDevice } from '@/wallet/smart-wallet';

type Screen = 'loading' | 'signed-out' | 'no-wallet' | 'unlinked-device' | 'wallet';

const topCashbackShown = 10;

const preWalletScreens: Screen[] = ['loading', 'signed-out'];

export default function HomeScreen() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>(Platform.OS === 'web' ? 'signed-out' : 'loading');
  const [wallet, setWallet] = useState<SmartWallet | null>(null);
  const [unlinkedWallet, setUnlinkedWallet] = useState<SmartWallet | null>(null);
  const [profileCountry, setProfileCountry] = useState<string | undefined>(undefined);
  const { view, refresh } = useHoldings(wallet);
  const { busy, message, setMessage, run } = useBusyAction();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [giftCardsRefreshKey, setGiftCardsRefreshKey] = useState(0);
  const vaultShares = view?.holdings.balances.vaultShares ?? 0n;
  const walletLoadStarted = useRef(false);
  const homeFocused = useRef(false);
  const { wide } = usePageLayout();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const catalog = useCatalog(screen === 'wallet' ? profileCountry : undefined);

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
      await Promise.all([showWallet(loaded), loaded ? openActiveOrder() : undefined]);
    } catch (error) {
      if (error instanceof UnlinkedDevice) {
        setUnlinkedWallet(error.wallet);
        setScreen('unlinked-device');
        return;
      }
      walletLoadStarted.current = false;
      throw error;
    }
  }, [showWallet, openActiveOrder]);

  const loadProfileCountry = useCallback(async () => {
    const profile = await ctx.me().catch(() => null);
    setProfileCountry(profile && !profile.needsSetup() ? profile.country : undefined);
  }, []);

  const readSession = useCallback(async () => {
    try {
      if (await ctx.isSignedIn()) {
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
    } catch (error) {
      walletLoadStarted.current = false;
      setMessage(errorMessage(error));
    }
  }, [screen, loadWallet, loadProfileCountry, setMessage]);

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
      showWallet(await SmartWallet.create(profile.passkeyLabel()));
    });

  const refreshBalances = useCallback(async () => {
    if (!wallet) {
      return;
    }
    try {
      await refresh();
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

  const [depositOpen, setDepositOpen] = useState(false);
  const { scrollRef, onScroll, scrim } = useScrimScroll();

  const confirmWithdraw = () => {
    const prompt = 'Move your savings back to your account balance?';
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(prompt)) {
        withdraw();
      }
      return;
    }
    Alert.alert('Withdraw savings', prompt, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Withdraw', onPress: withdraw },
    ]);
  };

  const withdraw = () =>
    run(async () => {
      if (!wallet || vaultShares === 0n) {
        return;
      }
      const result = await wallet.withdraw(vaultShares).catch((error: unknown) => {
        if (error instanceof UnlinkedDevice) {
          setUnlinkedWallet(error.wallet);
          setScreen('unlinked-device');
        }
        throw error;
      });
      if (result.error) {
        setMessage(result.error);
      } else {
        toast('Savings withdrawn');
      }
      await refresh();
    });

  const openMerchant = (merchant: Merchant) => router.push(`/shop/${merchant.slug}`);
  const topMerchant = catalog?.top[0] ?? null;

  if (screen === 'signed-out') {
    return (
      <ThemedView style={styles.container}>
        <StatusBar style="auto" />
        <Animated.ScrollView
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.storeScroll}
          keyboardShouldPersistTaps="handled">
          <SignedOutStore onOpen={openMerchant} />
        </Animated.ScrollView>
        <StatusBarScrim style={scrim} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <StatusBar style="auto" />
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
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
        <BalanceHeader view={screen === 'wallet' ? view : null}>
          {screen === 'wallet' && wallet && (
            <HomeActions
              depositOpen={depositOpen}
              onAddMoney={() => setDepositOpen((open) => !open)}
              onShop={() => router.navigate('/shop')}
              onCashback={() => router.navigate('/orders/cashback')}
              onWithdraw={confirmWithdraw}
              withdrawDisabled={busy || vaultShares === 0n}
            />
          )}
        </BalanceHeader>

        <View style={[styles.content, wide && styles.contentWide]}>
          {!wide && screen === 'wallet' && (
            <NextStep
              view={view}
              topMerchant={topMerchant}
              onAddMoney={() => setDepositOpen(true)}
              onOpenMerchant={openMerchant}
            />
          )}

          {screen === 'wallet' && wallet && depositOpen && (
            <Animated.View entering={FadeInDown.duration(Motion.state)}>
              <AddMoney wallet={wallet} view={view} refresh={refresh} onClose={() => setDepositOpen(false)} />
            </Animated.View>
          )}

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

          {message !== '' && <Notice message={message} />}

          {screen === 'wallet' && wallet && (
            <View style={[styles.overview, wide && styles.overviewWide]}>
              <View style={[styles.column, wide && styles.columnWide]}>
                <SpendingBalances view={view} />
                <SavingsCard
                  view={view}
                  onWithdraw={confirmWithdraw}
                  withdrawDisabled={busy || vaultShares === 0n}
                  onCashback={() => router.navigate('/orders/cashback')}
                />
              </View>
              <View style={[styles.column, wide && styles.columnWide]}>
                {wide && (
                  <NextStep
                    view={view}
                    topMerchant={topMerchant}
                    onAddMoney={() => setDepositOpen(true)}
                    onOpenMerchant={openMerchant}
                  />
                )}
                <RecentGiftCards
                  refreshKey={giftCardsRefreshKey}
                  onOpenOrder={(id) => router.push(`/orders/${id}`)}
                  onSeeAll={() => router.navigate('/orders')}
                  onShop={() => router.navigate('/shop')}
                />
              </View>
            </View>
          )}

          {screen === 'wallet' && (
            <MerchantCardStrip
              title="Top cashback"
              merchants={catalog?.top.slice(0, topCashbackShown) ?? []}
              onOpen={openMerchant}
              onSeeAll={() => router.navigate('/shop')}
            />
          )}
        </View>
        {wide && <SiteFooter />}
      </Animated.ScrollView>
      <StatusBarScrim style={scrim} />
    </ThemedView>
  );
}

function SignedOutStore({ onOpen }: { onOpen: (merchant: Merchant) => void }) {
  const router = useRouter();
  const { country } = useMarket();
  const { wide } = usePageLayout();
  const catalog = useCatalog(country);
  const [search, setSearch] = useState('');
  const searchShop = () => {
    const q = search.trim();
    if (q) {
      router.navigate({ pathname: '/shop', params: { q } });
    }
  };
  return (
    <>
      <StorefrontHero
        catalog={catalog}
        country={country}
        search={search}
        onSearch={setSearch}
        onSubmitSearch={searchShop}
        onOpen={onOpen}
        accessory={
          wide ? null : (
            <View style={styles.heroActions}>
              <CountryMenu />
              <SignInButton />
            </View>
          )
        }
      />
      <PageWidth style={styles.storeBody}>
        <TopCashback catalog={catalog} onOpen={onOpen} />
        <MerchantCatalog
          country={country}
          categories={catalog?.categories ?? []}
          search={search}
          onSearch={setSearch}
          onOpen={onOpen}
        />
      </PageWidth>
      <HowLoopWorks />
      <SiteFooter />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: BottomTabInset + Spacing.five,
  },
  storeScroll: {
    paddingBottom: BottomTabInset,
  },
  storeBody: {
    paddingVertical: Spacing.six,
    gap: Spacing.six,
  },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
    gap: Spacing.five,
  },
  contentWide: {
    paddingTop: Spacing.five,
    maxWidth: Layout.pageMaxWidth,
    paddingHorizontal: Layout.wideGutter,
    paddingBottom: Spacing.six,
  },
  overview: {
    gap: Spacing.five,
  },
  overviewWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.five,
  },
  column: {
    gap: Spacing.five,
  },
  columnWide: {
    flex: 1,
    minWidth: 0,
  },
  sheet: {
    gap: Spacing.three,
  },
  form: {
    maxWidth: Layout.formMaxWidth,
  },
});
