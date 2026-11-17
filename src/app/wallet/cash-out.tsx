import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button, Field } from '@/components/ui/form';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { ListGroup, ListRow } from '@/components/ui/list-row';
import { PageHeader } from '@/components/page-header';
import { SiteFooter } from '@/components/site-footer';
import { StatusTracker } from '@/components/status-tracker';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { Layout, Motion, ScrollEndInset, Spacing } from '@/constants/theme';
import { BankWithdrawal } from '@/ctx/bank-withdrawal';
import { ctx, CtxError } from '@/ctx/client';
import { paymentLock } from '@/ctx/payment-lock';
import type { PriceWindow } from '@/ctx/price-window';
import { useAccountChanges } from '@/hooks/use-account-changes';
import { useAppRefresh } from '@/hooks/use-app-refresh';
import { useBusyAction } from '@/hooks/use-busy-action';
import { paymentSender, pendingTopUps } from '@/hooks/use-sent-payment';
import { useWallet } from '@/hooks/use-wallet';
import { money } from '@/money';
import { haptics } from '@/native/haptics';
import { errorReporting } from '@/ops/error-reporting';
import { strings } from '@/strings';
import { holdCriticalReload } from '@/updates/update-checker';
import { CashOut, type CashOutResult } from '@/wallet/cash-out';
import type { TopUpOutcome } from '@/wallet/savings-top-up';
import { WalletBlocked, type SmartWallet } from '@/wallet/smart-wallet';

type Step = 'loading' | 'bank' | 'amount' | 'review' | 'status';

const currency = BankWithdrawal.currency;

async function topUpFromSavings(wallet: SmartWallet, amount: bigint, window: PriceWindow): Promise<TopUpOutcome> {
  const outcome = await wallet
    .savingsTopUp(currency)
    .run(amount, window, await pendingTopUps.get(wallet.address, currency));
  const unconfirmed = outcome.kind === 'stillMoving' || outcome.kind === 'covered' ? outcome.withdrawal : undefined;
  await pendingTopUps.keep(wallet.address, currency, unconfirmed);
  return outcome;
}

function cashOutFrom(wallet: SmartWallet): CashOut {
  return new CashOut({
    request: (request) => ctx.requestBankWithdrawal(request),
    recorded: (paymentId) => paymentSender.recorded(paymentId),
    topUp: (amount, window) => topUpFromSavings(wallet, amount, window),
    send: async (withdrawal) =>
      (await paymentSender.send(withdrawal.paymentId, () => wallet.payWithdrawal(withdrawal))).state,
    now: () => Date.now(),
  });
}

export default function CashOutScreen() {
  const router = useRouter();
  const { state, wallet, view, refresh, reload, problem } = useWallet();
  const { busy, message, setMessage, run, load } = useBusyAction();
  const [step, setStep] = useState<Step>('loading');
  const [withdrawal, setWithdrawal] = useState<BankWithdrawal | null>(null);
  const [accountName, setAccountName] = useState('');
  const [sortCode, setSortCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [input, setInput] = useState('');

  const available = view?.holdings.spendable(currency) ?? 0n;
  const smallest = money.ctx(BankWithdrawal.smallest, currency);
  const largest = money.token(BankWithdrawal.largestFor(available), currency);
  const canCashOut = BankWithdrawal.amountOf(BankWithdrawal.smallest, available) !== null;
  const amount = BankWithdrawal.amountOf(input, available);
  const fromSavings = amount !== null && view?.holdings.coverage(currency, amount).kind === 'savings';
  const shownAmount = withdrawal
    ? money.ctx(withdrawal.amount, withdrawal.currency)
    : amount === null
      ? ''
      : money.token(amount, currency);
  const progress = withdrawal?.progress(shownAmount) ?? null;

  const showLatest = useCallback(async (hasOpen = false) => {
    const [latest, profile] = await Promise.all([ctx.latestBankWithdrawal(), ctx.me()]);
    setAccountName(profile.legalName ?? '');
    if (!latest || (latest.isSettled() && !hasOpen)) {
      setWithdrawal(null);
      setStep('bank');
      return;
    }
    const sent = latest.isAwaitingPayment() ? await paymentSender.recorded(latest.paymentId) : null;
    const unsent = latest.isAwaitingPayment() && sent?.kind !== 'confirming';
    if (unsent && (latest.payWindow()?.isClosed(Date.now()) ?? true)) {
      setWithdrawal(null);
      setStep('bank');
      return;
    }
    setWithdrawal(latest);
    setStep(unsent ? 'review' : 'status');
  }, []);

  useEffect(() => {
    if (state === 'ready') {
      load(() => showLatest());
    }
  }, [state, load, showLatest]);

  const followedId = step === 'status' && withdrawal && !withdrawal.isSettled() ? withdrawal.id : null;
  const follow = useCallback(() => {
    if (!followedId) {
      return;
    }
    ctx
      .bankWithdrawal(followedId)
      .then((followed) => {
        setWithdrawal(followed);
        return refresh();
      })
      .catch((error: unknown) => errorReporting.reportError(error, 'Cash out status'));
  }, [followedId, refresh]);
  useAccountChanges(follow, followedId !== null);
  useAppRefresh(follow);

  const settle = (task: (cashOut: CashOut) => Promise<CashOutResult>) =>
    run(async () => {
      if (!wallet) {
        return;
      }
      let result: CashOutResult;
      try {
        result = await holdCriticalReload(() =>
          paymentLock.exclusive(`spend:${wallet.address}`, () => task(cashOutFrom(wallet))),
        );
      } catch (error) {
        if (error instanceof WalletBlocked) {
          reload();
        }
        const refusal = error instanceof CtxError ? CashOut.refusalMessage(error.errorName()) : null;
        if (refusal === null) {
          throw error;
        }
        haptics.error();
        await showLatest(true);
        setMessage(refusal);
        return;
      } finally {
        refresh().catch((error: unknown) => errorReporting.reportError(error, 'Cash out refresh'));
      }
      setWithdrawal(result.withdrawal);
      if (result.kind === 'sent') {
        haptics.success();
        setStep('status');
        return;
      }
      haptics.error();
      setStep('review');
      setMessage(result.message);
    });

  const confirm = () => {
    if (withdrawal) {
      return settle((cashOut) => cashOut.pay(withdrawal));
    }
    if (amount === null) {
      return undefined;
    }
    const request = BankWithdrawal.request(amount, sortCode, accountNumber);
    return settle((cashOut) => cashOut.start(request));
  };

  return (
    <ThemedView style={styles.container}>
      <StatusBar style="dark" />
      <KeyboardAvoid>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <PageHeader title="Cash out to your bank" belowNavigationHeader />
          <View style={styles.body}>
            {state !== 'ready' && state !== 'loading' && (
              <ThemedText type="small" themeColor="textSecondary">
                {problem || 'Sign in and finish setting up your account to cash out.'}
              </ThemedText>
            )}

            {step === 'bank' && (
              <Animated.View key="bank" entering={FadeIn.duration(Motion.state)} style={styles.step}>
                <ThemedText type="heading" accessibilityRole="header">
                  Where should we send it?
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {accountName
                    ? `A UK bank account in the name ${accountName}.`
                    : 'A UK bank account in your name.'}
                </ThemedText>
                <Field
                  label={strings.field.sortCode}
                  value={BankWithdrawal.shownSortCode(sortCode)}
                  onChangeText={(text) => setSortCode(BankWithdrawal.digits(text, BankWithdrawal.sortCodeLength))}
                  keyboardType="number-pad"
                />
                <Field
                  label={strings.field.accountNumber}
                  value={accountNumber}
                  onChangeText={(text) =>
                    setAccountNumber(BankWithdrawal.digits(text, BankWithdrawal.accountNumberLength))
                  }
                  keyboardType="number-pad"
                />
                <Button
                  label="Continue"
                  variant="primary"
                  onPress={() => setStep('amount')}
                  disabled={!BankWithdrawal.accountReady(sortCode, accountNumber)}
                />
              </Animated.View>
            )}

            {step === 'amount' && (
              <Animated.View key="amount" entering={FadeIn.duration(Motion.state)} style={styles.step}>
                <ThemedText type="heading" accessibilityRole="header">
                  How much?
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {canCashOut
                    ? `You can cash out ${smallest} to ${largest}.`
                    : `You need at least ${smallest} to cash out.`}
                </ThemedText>
                <Field
                  label={money.amountLabel(currency)}
                  value={input}
                  onChangeText={setInput}
                  keyboardType="decimal-pad"
                />
                {canCashOut && input !== '' && amount === null && (
                  <ThemedText type="small" themeColor="danger">
                    {`Enter an amount from ${smallest} to ${largest}`}
                  </ThemedText>
                )}
                <Button
                  label="Review"
                  variant="primary"
                  onPress={() => {
                    setMessage('');
                    setStep('review');
                  }}
                  disabled={amount === null}
                />
                <Button label="Back" variant="quiet" onPress={() => setStep('bank')} />
              </Animated.View>
            )}

            {step === 'review' && (
              <Animated.View key="review" entering={FadeIn.duration(Motion.state)} style={styles.step}>
                <ThemedText type="heading" accessibilityRole="header">
                  Check and confirm
                </ThemedText>
                <ListGroup>
                  <ListRow label="Amount" value={shownAmount} trailing="none" />
                  <ListRow label="To" value={withdrawal?.accountName ?? accountName} trailing="none" />
                  <ListRow
                    label="Sort code"
                    value={BankWithdrawal.shownSortCode(withdrawal?.sortCode ?? sortCode)}
                    trailing="none"
                  />
                  <ListRow
                    label="Account number"
                    value={withdrawal ? `Ending ${withdrawal.accountNumberLast4}` : accountNumber}
                    trailing="none"
                  />
                </ListGroup>
                <ThemedText type="small" themeColor="textSecondary">
                  {withdrawal
                    ? 'To change these details, wait a few minutes for this request to run out.'
                    : fromSavings
                      ? 'This comes out of your savings. We check every cash out before paying it.'
                      : 'We check every cash out before paying it.'}
                </ThemedText>
                <Button label={`Cash out ${shownAmount}`} variant="primary" onPress={confirm} busy={busy} />
                {!withdrawal && (
                  <Button label="Back" variant="quiet" onPress={() => setStep('amount')} disabled={busy} />
                )}
              </Animated.View>
            )}

            {step === 'status' && progress && (
              <Animated.View key="status" entering={FadeIn.duration(Motion.state)} style={styles.step}>
                <ThemedText type="heading" accessibilityRole="header" accessibilityLiveRegion="polite">
                  {progress.headline}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {progress.detail}
                </ThemedText>
                {progress.step !== null && <StatusTracker steps={BankWithdrawal.steps} current={progress.step} />}
                <Button label="Done" variant="primary" onPress={() => router.navigate('/wallet')} />
              </Animated.View>
            )}

            {message !== '' && (
              <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite" style={styles.message}>
                {message}
              </ThemedText>
            )}
          </View>
          <SiteFooter />
        </ScrollView>
      </KeyboardAvoid>
    </ThemedView>
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
  body: {
    width: '100%',
    maxWidth: Layout.formMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  step: {
    gap: Spacing.three,
  },
  message: {
    marginTop: Spacing.three,
  },
});
