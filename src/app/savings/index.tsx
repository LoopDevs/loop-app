import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button, Field, Notice } from '@/components/form';
import { useScrimScroll } from '@/components/home-panel';
import { SavingsCard } from '@/components/home-overview';
import { PageHeader } from '@/components/page-header';
import { useSignIn } from '@/components/sign-in';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useToast } from '@/components/toast';
import { BottomTabInset, Layout, MaxContentWidth, Motion, Radius, Spacing } from '@/constants/theme';
import { normalizeAmount } from '@/ctx/amount-input';
import { useBusyAction } from '@/hooks/use-busy-action';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useTheme } from '@/hooks/use-theme';
import { useWallet } from '@/hooks/use-wallet';
import { money } from '@/money';
import { Savings } from '@/wallet/savings';
import { UnlinkedDevice } from '@/wallet/smart-wallet';

const quickAmounts = ['25', '50', '100'];

export default function SavingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const toast = useToast();
  const { wide } = usePageLayout();
  const { openSignIn } = useSignIn();
  const { state, wallet, view, refresh, reload } = useWallet();
  const { busy, message, setMessage, run } = useBusyAction();
  const { scrollRef, onScroll, scrim } = useScrimScroll();
  const [adding, setAdding] = useState(false);
  const vaultShares = view?.holdings.balances.vaultShares ?? 0n;

  const withdraw = () =>
    run(async () => {
      if (!wallet || vaultShares === 0n) {
        return;
      }
      const result = await wallet.withdraw(vaultShares).catch((error: unknown) => {
        if (error instanceof UnlinkedDevice) {
          reload();
        }
        throw error;
      });
      if (result.error) {
        setMessage(result.error);
      } else {
        toast('Savings moved to your balance');
      }
      await refresh();
    });

  const confirmWithdraw = () => {
    const prompt = 'Move your savings back to your balance?';
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

  const addToSavings = () => {
    if (state === 'signed-out') {
      openSignIn('Sign in to start saving.');
      return;
    }
    setAdding((open) => !open);
  };

  return (
    <ThemedView style={styles.container}>
      <StatusBar style="dark" />
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}>
        <PageHeader title="Savings" width={wide ? 'page' : 'content'} />
        <View style={[styles.body, wide && styles.bodyWide]}>
          <View style={[styles.hero, { backgroundColor: theme.accentSoft }]}>
            <View style={[styles.heroIcon, { backgroundColor: theme.accent }]}>
              <SymbolView
                name={{ ios: 'leaf', android: 'savings', web: 'savings' }}
                size={22}
                tintColor={theme.onAccent}
              />
            </View>
            <ThemedText type="subtitle" accessibilityRole="header">
              {Savings.rateHeadline}
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              Your savings grow every day. Your cashback lands here too, and you can take it out whenever you like.
            </ThemedText>
            <View style={wide && styles.heroAction}>
              <Button label="Add to savings" variant="primary" onPress={addToSavings} selected={adding} />
            </View>
          </View>

          {adding && <AddToSavings onClose={() => setAdding(false)} />}

          {state === 'setup' && (
            <Notice
              tone="neutral"
              message="Finish setting up Loop on Home to start saving."
              actionLabel="Go to Home"
              onAction={() => router.navigate('/')}
            />
          )}

          {state === 'ready' && (
            <SavingsCard
              view={view}
              onWithdraw={confirmWithdraw}
              withdrawDisabled={busy || vaultShares === 0n}
              onCashback={() => router.push('/wallet/cashback')}
            />
          )}

          {state === 'signed-out' && (
            <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <ThemedText type="heading">Save with your cashback</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Sign in to see your savings and how much they have grown.
              </ThemedText>
              <Button label="Sign in" variant="primary" onPress={() => openSignIn('Sign in to see your savings.')} />
            </View>
          )}

          {message !== '' && <Notice message={message} />}
        </View>
      </Animated.ScrollView>
      <Animated.View pointerEvents="none" style={scrim} />
    </ThemedView>
  );
}

function AddToSavings({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const [input, setInput] = useState('');
  const amount = normalizeAmount(input);
  return (
    <Animated.View
      entering={FadeInDown.duration(Motion.state)}
      style={[styles.card, styles.sheet, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText type="heading" accessibilityRole="header">
        How much do you want to save?
      </ThemedText>
      <Field
        placeholder="Amount in dollars"
        value={input}
        onChangeText={setInput}
        keyboardType="decimal-pad"
        accessibilityLabel="Amount in dollars"
      />
      <View style={styles.chips}>
        {quickAmounts.map((quick) => (
          <View key={quick} style={styles.chip}>
            <Button label={money.fiat(quick, 'USD')} selected={amount === quick} onPress={() => setInput(quick)} />
          </View>
        ))}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        Adding money to savings yourself is coming soon. Your cashback already goes into savings.
      </ThemedText>
      <Button label="Coming soon" variant="primary" onPress={onClose} disabled />
      <Button label="Close" variant="quiet" onPress={onClose} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    paddingBottom: BottomTabInset + Spacing.five,
  },
  body: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: Spacing.four,
  },
  bodyWide: {
    maxWidth: Layout.formMaxWidth * 1.4,
    paddingTop: Spacing.five,
  },
  hero: {
    padding: Spacing.four,
    gap: Spacing.two,
    borderRadius: Radius.card,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  heroAction: {
    alignSelf: 'flex-start',
    paddingTop: Spacing.two,
  },
  card: {
    padding: Spacing.four,
    gap: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sheet: {
    maxWidth: Layout.sheetWidth,
  },
  chips: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  chip: {
    flex: 1,
  },
});
