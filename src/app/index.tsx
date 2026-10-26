import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useRef, useState } from 'react';
import { Alert, Platform, RefreshControl, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { ExternalLink } from '@/components/external-link';
import { Button, Field } from '@/components/form';
import { HomeActions } from '@/components/home-actions';
import { HomeGiftCards } from '@/components/home-gift-cards';
import { HomePanel, useScrimScroll } from '@/components/home-panel';
import { BalanceSkeleton } from '@/components/skeleton';
import { SocialSignInButtons } from '@/components/social-sign-in-buttons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useToast } from '@/components/toast';
import { loopLinks } from '@/constants/loop-links';
import { BottomTabInset, MaxContentWidth, Motion, Radius, Spacing } from '@/constants/theme';
import { ctx } from '@/ctx/client';
import { useAppRefresh } from '@/hooks/use-app-refresh';
import { errorMessage, useBusyAction } from '@/hooks/use-busy-action';
import { useHoldings } from '@/hooks/use-holdings';
import { useTheme } from '@/hooks/use-theme';
import { socialSignIn } from '@/native/social-sign-in';
import type { SocialProvider } from '@/session/social-sign-in';
import { network } from '@/stellar/network';
import { SmartWallet } from '@/wallet/smart-wallet';

type Screen = 'loading' | 'email' | 'code' | 'no-wallet' | 'wallet';

const preWalletScreens: Screen[] = ['loading', 'email', 'code'];

export default function HomeScreen() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>('loading');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [wallet, setWallet] = useState<SmartWallet | null>(null);
  const { view, refresh } = useHoldings(wallet);
  const { busy, message, setMessage, run } = useBusyAction();
  const toast = useToast();
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
    walletLoadStarted.current = true;
    try {
      const loaded = await SmartWallet.load();
      await Promise.all([showWallet(loaded), loaded ? openActiveOrder() : undefined]);
    } catch (error) {
      walletLoadStarted.current = false;
      throw error;
    }
  }, [showWallet, openActiveOrder]);

  const readSession = useCallback(async () => {
    try {
      if (await ctx.isSignedIn()) {
        if (preWalletScreens.includes(screen) && !walletLoadStarted.current) {
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
      if (!(await ctx.isSignedIn())) {
        await ctx.verifyCode(email.trim(), code.trim());
      }
      await loadWallet();
    });

  const resendCode = () =>
    run(async () => {
      await ctx.requestCode(email.trim());
      toast('Code sent');
    });

  const changeEmail = () => {
    setCode('');
    setMessage('');
    setScreen('email');
  };

  const signInWith = (provider: SocialProvider) =>
    run(async () => {
      const idToken = await socialSignIn.idToken(provider);
      if (!idToken) {
        return;
      }
      await ctx.signInWithOAuth(provider, idToken);
      await loadWallet();
    });

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

  const [depositOpen, setDepositOpen] = useState(false);
  const { onScroll, scrim } = useScrimScroll();

  const copyAddress = async () => {
    if (!wallet) {
      return;
    }
    await Clipboard.setStringAsync(wallet.address);
    toast('Address copied');
  };

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
      const result = await wallet.withdraw(vaultShares);
      const outcome = result.error
        ? `${result.status}: ${result.error}`
        : `${result.status} ${result.hash}`;
      setMessage(outcome);
      await refresh();
    });

  const signedIn = screen === 'wallet';
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <StatusBar style="light" />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          screen === 'wallet' ? (
            <RefreshControl refreshing={refreshing} onRefresh={pullToRefresh} tintColor={theme.accent} />
          ) : undefined
        }>
        <HomePanel view={screen === 'wallet' ? view : null} signedIn={signedIn}>
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
        </HomePanel>

        <View style={styles.content}>
          {screen === 'loading' && <BalanceSkeleton />}

          {screen === 'wallet' && wallet && depositOpen && (
            <Animated.View
              entering={FadeInDown.duration(Motion.state)}
              style={[styles.sheet, styles.deposit, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="heading">Add money</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Send money on the Stellar network to this address. It shows here once it arrives.
              </ThemedText>
              <ThemedText type="code" selectable>
                {wallet.address}
              </ThemedText>
              <Button label="Copy address" variant="primary" onPress={copyAddress} />
              {network.friendbotUrl && (
                <Button label="Fund with testnet XLM" onPress={fund} disabled={busy} />
              )}
            </Animated.View>
          )}

          {screen === 'email' && (
            <Animated.View entering={FadeIn.duration(Motion.state)} style={styles.sheet}>
              <ThemedText type="subtitle">Sign in to Loop</ThemedText>
              <SocialSignInButtons
                providers={socialSignIn.providers()}
                disabled={busy}
                onPress={signInWith}
              />
              <Field
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="send"
                onSubmitEditing={() => email.trim() && !busy && requestCode()}
              />
              <Button
                label={busy ? 'Sending code…' : 'Send code'}
                variant="primary"
                onPress={requestCode}
                disabled={busy || !email.trim()}
              />
            </Animated.View>
          )}

          {screen === 'code' && (
            <Animated.View entering={FadeIn.duration(Motion.state)} style={styles.sheet}>
              <ThemedText type="subtitle">Check your email</ThemedText>
              <ThemedText themeColor="textSecondary">
                We sent a code to {email.trim()}. Enter it below.
              </ThemedText>
              <Field
                value={code}
                onChangeText={setCode}
                placeholder="Code"
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => code.trim() && !busy && verifyCode()}
              />
              <Button
                label={busy ? 'Signing in…' : 'Sign in'}
                variant="primary"
                onPress={verifyCode}
                disabled={busy || !code.trim()}
              />
              <View style={styles.row}>
                <View style={styles.rowItem}>
                  <Button label="Resend code" variant="quiet" onPress={resendCode} disabled={busy} />
                </View>
                <View style={styles.rowItem}>
                  <Button label="Change email" variant="quiet" onPress={changeEmail} disabled={busy} />
                </View>
              </View>
            </Animated.View>
          )}

          {screen === 'no-wallet' && (
            <Animated.View entering={FadeIn.duration(Motion.state)} style={styles.sheet}>
              <ThemedText type="subtitle">Set up your wallet</ThemedText>
              <ThemedText themeColor="textSecondary">
                Your wallet holds your money and cashback. A passkey on this device keeps it
                yours, with no password to remember.
              </ThemedText>
              <Button
                label={busy ? 'Creating wallet…' : 'Create wallet'}
                variant="primary"
                onPress={createWallet}
                disabled={busy}
              />
            </Animated.View>
          )}

          {screen === 'wallet' && wallet && <HomeGiftCards onOpen={(slug) => router.push(`/shop/${slug}`)} />}

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
            <ThemedText type="small" selectable accessibilityLiveRegion="polite">
              {message}
            </ThemedText>
          )}
        </View>
      </Animated.ScrollView>
      <Animated.View pointerEvents="none" style={scrim} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: BottomTabInset + Spacing.five,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
    gap: Spacing.four,
  },
  sheet: {
    gap: Spacing.three,
  },
  deposit: {
    padding: Spacing.three,
    borderRadius: Radius.control,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  rowItem: {
    flex: 1,
  },
  link: {
    textDecorationLine: 'underline',
  },
});
