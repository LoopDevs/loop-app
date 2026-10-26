import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field } from '@/components/form';
import { GiftCardPurchase } from '@/components/gift-card-purchase';
import { BalanceSkeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { ctx } from '@/ctx/client';
import { useAppRefresh } from '@/hooks/use-app-refresh';
import { money } from '@/money';
import { haptics } from '@/native/haptics';
import { network } from '@/stellar/network';
import { type Balances, SmartWallet } from '@/wallet/smart-wallet';

type Screen = 'loading' | 'email' | 'code' | 'no-wallet' | 'wallet';

export default function HomeScreen() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [wallet, setWallet] = useState<SmartWallet | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (error) {
      haptics.error();
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, []);

  const showWallet = useCallback(async (loaded: SmartWallet | null) => {
    setWallet(loaded);
    setScreen(loaded ? 'wallet' : 'no-wallet');
    setBalances(loaded ? await loaded.balances() : null);
  }, []);

  const loadWallet = useCallback(async () => {
    await showWallet(await SmartWallet.load());
  }, [showWallet]);

  useEffect(() => {
    ctx
      .isSignedIn()
      .then((signedIn) => (signedIn ? loadWallet() : setScreen('email')))
      .catch((error) => setMessage(errorMessage(error)));
  }, [loadWallet]);

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
      await showWallet(await SmartWallet.create(email.trim() || 'Loop wallet'));
    });

  const refreshBalances = useCallback(async () => {
    if (!wallet) {
      return;
    }
    try {
      setBalances(await wallet.balances());
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }, [wallet]);

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
      setBalances(await wallet.balances());
    });

  const withdraw = () =>
    run(async () => {
      if (!wallet || !balances || balances.vaultShares === 0n) {
        return;
      }
      const result = await wallet.withdraw(balances.vaultShares);
      const outcome = result.error
        ? `${result.status}: ${result.error}`
        : `${result.status} ${result.hash}`;
      setMessage(outcome);
      setBalances(await wallet.balances());
    });

  const signOut = () =>
    run(async () => {
      await ctx.signOut();
      setWallet(null);
      setBalances(null);
      setScreen('email');
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
              {!balances && <BalanceSkeleton />}
              {balances?.tokens.map(({ token, amount }) => (
                <ThemedText key={token.currency}>
                  {token.symbol}: {money.token(amount, token.currency)}
                </ThemedText>
              ))}
              {balances && (
                <ThemedText>Savings: {money.token(balances.vaultValue, 'XLM.USDC')}</ThemedText>
              )}
              <Button label="Refresh" onPress={refreshBalances} disabled={busy} />
              {network.friendbotUrl && (
                <Button label="Fund with testnet XLM" onPress={fund} disabled={busy} />
              )}
              <Button
                label="Withdraw savings"
                onPress={withdraw}
                disabled={busy || !balances || balances.vaultShares === 0n}
              />
              <GiftCardPurchase wallet={wallet} busy={busy} run={run} onPaid={refreshBalances} />
            </>
          )}

          {(screen === 'no-wallet' || screen === 'wallet') && (
            <Button label="Sign out" onPress={signOut} disabled={busy} />
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
});
