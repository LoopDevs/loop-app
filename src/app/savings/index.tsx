import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button, Field, Notice } from '@/components/form';
import { useScrimScroll } from '@/components/home-panel';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { SavingsCard } from '@/components/home-overview';
import { PageHeader } from '@/components/page-header';
import { useSignIn } from '@/components/sign-in';
import { SiteFooter } from '@/components/site-footer';
import { SplitLayout } from '@/components/split-layout';
import { PageWidth } from '@/components/storefront';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useToast } from '@/components/toast';
import { Layout, Motion, Radius, ScrollEndInset, Spacing } from '@/constants/theme';
import { normalizeAmount } from '@/ctx/amount-input';
import { errorMessage, useBusyAction } from '@/hooks/use-busy-action';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useTheme } from '@/hooks/use-theme';
import { useWallet } from '@/hooks/use-wallet';
import { money } from '@/money';
import { units } from '@/stellar/units';
import { Savings, type DepositInput } from '@/wallet/savings';
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
  const depositing = useRef(false);
  const vaultShares = view?.holdings.balances.vaultShares ?? 0n;
  const walletUsdc = view?.holdings.inWallet(Savings.currency) ?? 0n;

  const reloadIfUnlinked = (error: unknown): never => {
    if (error instanceof UnlinkedDevice) {
      reload();
    }
    throw error;
  };

  const withdraw = () =>
    run(async () => {
      if (!wallet || vaultShares === 0n) {
        return;
      }
      const result = await wallet.withdraw(vaultShares).catch(reloadIfUnlinked);
      if (result.error) {
        setMessage(result.error);
      } else {
        toast('Savings moved to your balance');
      }
      await refresh();
    });

  const deposit = (amount: bigint, input: DepositInput) => {
    if (depositing.current) {
      return;
    }
    depositing.current = true;
    return run(async () => {
      if (!wallet) {
        return;
      }
      const { sent, outcome } = await Savings.sendDeposit(
        () => wallet.deposit(amount).catch(reloadIfUnlinked),
        wallet.vaultCall(),
        input,
      );
      const refreshError = await refresh().then(
        () => '',
        (error: unknown) => errorMessage(error),
      );
      const text = Savings.depositMessage(outcome, amount, sent.hash);
      if (outcome === 'success' && !refreshError) {
        toast(text);
        setAdding(false);
        return;
      }
      setMessage(refreshError ? `${text}\n${refreshError}` : text);
    }).finally(() => {
      depositing.current = false;
    });
  };

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
      <KeyboardAvoid>
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}>
        <PageHeader title="Savings" width="page" />
        <PageWidth style={[styles.page, wide && styles.pageWide]}>
          <SplitLayout aside={wide ? <SavingsFacts /> : null} asideWidth={360}>
          <View style={[styles.hero, wide && styles.heroWide, { backgroundColor: theme.accentSoft }]}>
            <View style={[styles.heroIcon, { backgroundColor: theme.accent }]}>
              <SymbolView
                name={{ ios: 'leaf', android: 'savings', web: 'savings' }}
                size={22}
                tintColor={theme.onAccent}
              />
            </View>
            <ThemedText type={wide ? 'title' : 'subtitle'} accessibilityRole="header" style={styles.heroTitle}>
              {Savings.rateHeadline}
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.heroLine}>
              Your savings grow every day. Your cashback lands here too, and you can take it out whenever you like.
            </ThemedText>
            <View style={wide && styles.heroAction}>
              <Button label="Add to savings" variant="primary" onPress={addToSavings} selected={adding} />
            </View>
          </View>

          {adding && (
            <AddToSavings
              walletUsdc={walletUsdc}
              busy={busy}
              ready={state === 'ready'}
              onDeposit={deposit}
              onClose={() => setAdding(false)}
            />
          )}

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

          {!wide && <SavingsFacts />}
          </SplitLayout>
        </PageWidth>
        <SiteFooter />
      </Animated.ScrollView>
      </KeyboardAvoid>
      <Animated.View pointerEvents="none" style={scrim} />
    </ThemedView>
  );
}

const savingsFacts = [
  {
    icon: { ios: 'arrow.down.circle', android: 'south', web: 'south' },
    title: 'Cashback goes in by itself',
    body: 'Cashback from every gift card lands in your savings once the card is delivered.',
  },
  {
    icon: { ios: 'chart.line.uptrend.xyaxis', android: 'trending_up', web: 'trending_up' },
    title: 'It grows every day',
    body: 'Your savings earn every day. The rate can go up or down over time.',
  },
  {
    icon: { ios: 'arrow.uturn.backward', android: 'replay', web: 'replay' },
    title: 'Take it out any time',
    body: 'Move your savings back to your balance whenever you like.',
  },
] as const;

function SavingsFacts() {
  const router = useRouter();
  const theme = useTheme();
  return (
    <View style={[styles.card, styles.facts, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText type="heading" accessibilityRole="header">
        How savings work
      </ThemedText>
      {savingsFacts.map((fact) => (
        <View key={fact.title} style={styles.fact}>
          <View style={[styles.factIcon, { backgroundColor: theme.accentSoft }]}>
            <SymbolView name={fact.icon} size={18} tintColor={theme.accent} />
          </View>
          <View style={styles.factText}>
            <ThemedText type="smallBold">{fact.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {fact.body}
            </ThemedText>
          </View>
        </View>
      ))}
      <Button label="Read the FAQ" variant="quiet" onPress={() => router.navigate('/faq')} />
    </View>
  );
}

type AddToSavingsProps = {
  walletUsdc: bigint;
  busy: boolean;
  ready: boolean;
  onDeposit: (amount: bigint, input: DepositInput) => void;
  onClose: () => void;
};

function AddToSavings({ walletUsdc, busy, ready, onDeposit, onClose }: AddToSavingsProps) {
  const theme = useTheme();
  const [input, setInput] = useState('');
  const amount = normalizeAmount(input);
  const depositAmount = Savings.depositAmount(input, walletUsdc);
  const allOfIt = units.format(walletUsdc, units.decimals);
  const deposit = () => {
    if (depositAmount === null) {
      return;
    }
    const sentInput = input;
    onDeposit(depositAmount, {
      clear: () => setInput(''),
      restore: () => setInput(sentInput),
    });
  };
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
        <View style={styles.chip}>
          <Button
            label="Max"
            selected={input !== '' && input === allOfIt}
            onPress={() => setInput(allOfIt)}
            disabled={walletUsdc === 0n}
          />
        </View>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {ready
          ? `You have ${money.token(walletUsdc, Savings.currency)} in your balance to add.`
          : 'Finish setting up Loop on Home to start saving.'}
      </ThemedText>
      <Button
        label={busy ? 'Adding…' : 'Add to savings'}
        variant="primary"
        onPress={deposit}
        disabled={busy || !ready || depositAmount === null}
      />
      <Button label="Close" variant="quiet" onPress={onClose} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: ScrollEndInset,
  },
  page: {
    paddingTop: Spacing.two,
  },
  pageWide: {
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
  },
  hero: {
    padding: Spacing.four,
    gap: Spacing.two,
    borderRadius: Radius.card,
  },
  heroWide: {
    padding: Spacing.five,
    gap: Spacing.three,
  },
  heroTitle: {
    maxWidth: 560,
  },
  heroLine: {
    maxWidth: 520,
  },
  facts: {
    gap: Spacing.four,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  factIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  factText: {
    flex: 1,
    gap: Spacing.half,
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
