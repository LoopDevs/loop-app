import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ExternalLink } from '@/components/external-link';
import { Button, Field } from '@/components/form';
import { HoldingsSummary } from '@/components/holdings-summary';
import { BalanceSkeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { loopLinks } from '@/constants/loop-links';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { ctx } from '@/ctx/client';
import { useAppRefresh } from '@/hooks/use-app-refresh';
import { errorMessage, useBusyAction } from '@/hooks/use-busy-action';
import { useHoldings } from '@/hooks/use-holdings';
import { network } from '@/stellar/network';
import { SmartWallet } from '@/wallet/smart-wallet';

type Screen = 'loading' | 'email' | 'code' | 'no-wallet' | 'wallet';

export default function HomeScreen() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>('loading');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [wallet, setWallet] = useState<SmartWallet | null>(null);
  const { view, refresh } = useHoldings(wallet);
  const { busy, message, setMessage, run } = useBusyAction();
  const [refreshing, setRefreshing] = useState(false);
  const vaultShares = view?.holdings.balances.vaultShares ?? 0n;
  const walletLoadStarted = useRef(false);
  const homeFocused = useRef(false);

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
    const loaded = await SmartWallet.load();
    await Promise.all([showWallet(loaded), loaded ? openActiveOrder() : undefined]);
  }, [showWallet, openActiveOrder]);

  const readSession = useCallback(async () => {
    try {
      if (await ctx.isSignedIn()) {
        if (screen === 'loading' && !walletLoadStarted.current) {
          walletLoadStarted.current = true;
          await loadWallet();
        }
        return;
      }
      walletLoadStarted.current = false;
      setWallet(null);
      setScreen((current) => (current === 'code' ? current : 'email'));
    } catch (error) {
      walletLoadStarted.current = false;
      setMessage(errorMessage(error));
    }
  }, [screen, loadWallet, setMessage]);

  useFocusEffect(
    useCallback(() => {
      homeFocused.current = true;
      readSession();
      return () => {
        homeFocused.current = false;
      };
    }, [readSession]),
  );

  const requestCode = () =>
    run(async () => {
      await ctx.requestCode(email.trim());
      setScreen('code');
    });

  const verifyCode = () =>
    run(async () => {
      await ctx.verifyCode(email.trim(), code.trim());
      await loadWallet();
    });

  const createWallet = () =>
    run(async () => {
      showWallet(await SmartWallet.create(email.trim() || 'Loop wallet'));
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
    await refreshBalances();
    setRefreshing(false);
  };

  const fund = () =>
    run(async () => {
      if (!wallet) {
        return;
      }
      await wallet.fundWithFriendbot();
      await refresh();
    });

  const withdraw = () =>
    run(async () => {
      if (!wallet || vaultShares === 0n) {
        return;
      }
      const result = await wallet.withdraw(vaultShares);
      const outcome = result.error
        ? `${result.status}: ${result.error}`
        : `${result.status} ${result.hash}`;
      setMessage(outcome);
      await refresh();
    });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            screen === 'wallet' ? (
              <RefreshControl refreshing={refreshing} onRefresh={pullToRefresh} />
            ) : undefined
          }>
          <ThemedText type="subtitle">Loop</ThemedText>

          {screen === 'loading' && <BalanceSkeleton />}

          {screen === 'email' && (
            <>
              <Field
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                keyboardType="email-address"
              />
              <Button label="Send code" onPress={requestCode} disabled={busy || !email.trim()} />
            </>
          )}

          {screen === 'code' && (
            <>
              <ThemedText type="small">We sent a code to {email.trim()}</ThemedText>
              <Field value={code} onChangeText={setCode} placeholder="Code" keyboardType="number-pad" />
              <Button label="Sign in" onPress={verifyCode} disabled={busy || !code.trim()} />
            </>
          )}

          {screen === 'no-wallet' && (
            <>
              <ThemedText>Create your wallet with a passkey.</ThemedText>
              <Button label="Create wallet" onPress={createWallet} disabled={busy} />
            </>
          )}

          {screen === 'wallet' && wallet && (
            <>
              <ThemedText type="small">Deposit address</ThemedText>
              <ThemedText type="code" selectable>
                {wallet.address}
              </ThemedText>
              {view ? <HoldingsSummary view={view} /> : <BalanceSkeleton />}
              <Button label="Refresh" onPress={refreshBalances} disabled={busy} />
              {network.friendbotUrl && (
                <Button label="Fund with testnet XLM" onPress={fund} disabled={busy} />
              )}
              <Button
                label="Withdraw savings"
                onPress={withdraw}
                disabled={busy || vaultShares === 0n}
              />
              <Button label="Shop gift cards" onPress={() => router.navigate('/shop')} />
            </>
          )}

          {(screen === 'email' || screen === 'code') && (
            <ThemedText type="small" themeColor="textSecondary">
              By continuing you agree to Loop&apos;s{' '}
              <ExternalLink href={loopLinks.terms} style={styles.link}>
                Terms
              </ExternalLink>{' '}
              and{' '}
              <ExternalLink href={loopLinks.privacy} style={styles.link}>
                Privacy Policy
              </ExternalLink>
              .
            </ThemedText>
          )}

          {message !== '' && (
            <ThemedText type="small" selectable>
              {message}
            </ThemedText>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.three,
  },
  link: {
    textDecorationLine: 'underline',
  },
});
