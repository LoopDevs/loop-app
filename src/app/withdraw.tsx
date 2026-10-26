import { usePreventRemove, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BankWithdrawalRow } from '@/components/bank-withdrawal-row';
import { Button, Field } from '@/components/form';
import { NameStep } from '@/components/name-step';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useToast } from '@/components/toast';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { withdrawalAmountErrorMessage } from '@/ctx/amount-error';
import { BankWithdrawalForm, bankWithdrawalCurrency, type BankDetails } from '@/ctx/bank-withdrawal';
import { ctx, CtxError, type BankWithdrawal } from '@/ctx/client';
import { pollIntervalMs } from '@/ctx/gift-card-status';
import type { PaymentState } from '@/ctx/payment-state';
import { Profile } from '@/ctx/profile';
import { sentPayments } from '@/ctx/wallet-payments';
import { WithdrawalPayment } from '@/ctx/withdrawal-payment';
import { errorMessage, useBusyAction } from '@/hooks/use-busy-action';
import { useHoldings } from '@/hooks/use-holdings';
import { money } from '@/money';
import { haptics } from '@/native/haptics';
import { SmartWallet, UnlinkedDevice } from '@/wallet/smart-wallet';

type Step = 'amount' | 'bank' | 'needs-name' | 'review' | 'submitted';

type SentTransaction = {
  txId?: string;
  expiryLedger?: number;
};

const bankDetailsHint = 'Enter a 6-digit sort code and an 8-digit account number';

export default function WithdrawScreen() {
  const router = useRouter();
  const toast = useToast();
  const [wallet, setWallet] = useState<SmartWallet | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const { view, refresh } = useHoldings(wallet);
  const { busy, message, setMessage, run } = useBusyAction();
  const [step, setStep] = useState<Step>('amount');
  const [amountInput, setAmountInput] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [sortCodeInput, setSortCodeInput] = useState('');
  const [accountNumberInput, setAccountNumberInput] = useState('');
  const [bankError, setBankError] = useState<string | null>(null);
  const [bank, setBank] = useState<BankDetails | null>(null);
  const [retryAfterName, setRetryAfterName] = useState(false);
  const [withdrawal, setWithdrawal] = useState<BankWithdrawal | null>(null);
  const [heading, setHeading] = useState('');
  const [sending, setSending] = useState(false);
  const [unlinked, setUnlinked] = useState(false);
  const confirming = useRef(false);
  const following = useRef(0);

  const balance = view?.holdings.inWallet(bankWithdrawalCurrency) ?? 0n;

  const homeIfUnlinked = useCallback((error: unknown): never => {
    if (error instanceof UnlinkedDevice) {
      setUnlinked(true);
    }
    throw error;
  }, []);

  useEffect(() => {
    if (unlinked && !sending) {
      router.replace('/');
    }
  }, [unlinked, sending, router]);

  useEffect(() => {
    run(async () => {
      const [loaded, me] = await Promise.all([SmartWallet.load().catch(homeIfUnlinked), ctx.me()]);
      setWallet(loaded);
      setProfile(me);
    });
    return () => {
      following.current += 1;
    };
  }, [run, homeIfUnlinked]);

  useEffect(() => {
    refresh().catch((error: unknown) => setMessage(errorMessage(error)));
  }, [refresh, setMessage]);

  usePreventRemove(sending, () => toast('Wait until the payment is sent'));

  const clearBankDetails = () => {
    setSortCodeInput('');
    setAccountNumberInput('');
    setBank(null);
  };

  const changeAmount = (next: string) => {
    setAmountInput(next);
    setAmountError(null);
  };

  const toBank = () => {
    const check = BankWithdrawalForm.checkAmount(amountInput, balance);
    if ('error' in check) {
      setAmountError(check.error);
      return;
    }
    setAmount(check.amount);
    setStep('bank');
  };

  const toReview = () => {
    const details = BankWithdrawalForm.bankDetails(sortCodeInput, accountNumberInput);
    if (!details) {
      setBankError(bankDetailsHint);
      return;
    }
    setBank(details);
    setRetryAfterName(false);
    setStep(profile?.hasFullName() ? 'review' : 'needs-name');
  };

  const follow = async (created: BankWithdrawal, sent: SentTransaction) => {
    const generation = ++following.current;
    let current = created;
    for (let attempt = 0; attempt < BankWithdrawalForm.pollLimit; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      if (following.current !== generation) {
        return;
      }
      try {
        current = await ctx.bankWithdrawal(current.id);
      } catch {
        continue;
      }
      setWithdrawal(current);
      if (current.status !== 'awaiting-payment') {
        setHeading(BankWithdrawalForm.submittedHeading(current) ?? '');
        return;
      }
      if (!wallet) {
        continue;
      }
      let failure: PaymentState | null;
      try {
        const recorded = await sentPayments.get(current.paymentId);
        failure = await wallet.sentPaymentFailure(current, {
          txId: sent.txId ?? recorded?.txId,
          expiryLedger: sent.expiryLedger ?? recorded?.expiryLedger,
          transfer: recorded?.transfer,
        });
      } catch {
        continue;
      }
      if (failure) {
        setHeading(WithdrawalPayment.failureText(failure));
        return;
      }
    }
  };

  const pay = async (created: BankWithdrawal, confirmed: string) => {
    if (!wallet) {
      return;
    }
    setWithdrawal(created);
    setStep('submitted');
    const task = WithdrawalPayment.send(wallet, created, confirmed);
    if (!task) {
      return;
    }
    setSending(true);
    setHeading('Sending payment');
    try {
      const { state, resumed } = await task;
      if (state.kind !== 'confirming') {
        haptics.error();
        setHeading(WithdrawalPayment.failureText(state));
        return;
      }
      if (!resumed) {
        haptics.success();
      }
      setHeading(BankWithdrawalForm.submittedHeading(created) ?? '');
      void follow(created, state);
    } catch (error) {
      setHeading('');
      homeIfUnlinked(error);
    } finally {
      setSending(false);
    }
  };

  const openExisting = async () => {
    clearBankDetails();
    const latest = await ctx.latestBankWithdrawal();
    setWithdrawal(latest);
    setHeading('You already have a withdrawal in progress');
    setStep('submitted');
  };

  const confirm = (retried: boolean) => {
    if (confirming.current) {
      return;
    }
    confirming.current = true;
    return run(async () => {
      if (!bank) {
        return;
      }
      let created: BankWithdrawal;
      try {
        created = await ctx.createBankWithdrawal({ amount, ...bank });
      } catch (error) {
        if (!(error instanceof CtxError)) {
          throw error;
        }
        const name = error.errorName();
        if (name === 'ErrBankPaymentIdentityRequired') {
          setRetryAfterName(!retried);
          setStep('needs-name');
          if (retried) {
            setMessage(Profile.bankNameHint);
          }
          return;
        }
        if (name === 'ErrBankWithdrawalOpen') {
          await openExisting();
          return;
        }
        const amountMessage = withdrawalAmountErrorMessage(error);
        if (amountMessage) {
          setAmountError(amountMessage);
          setStep('amount');
          return;
        }
        setMessage(error.bodyField('message') ?? error.message);
        return;
      }
      clearBankDetails();
      await pay(created, amount);
    }).finally(() => {
      confirming.current = false;
    });
  };

  const nameSaved = (saved: Profile) => {
    setProfile(saved);
    setStep('review');
    if (retryAfterName) {
      setRetryAfterName(false);
      confirm(true);
    }
  };

  const finish = () =>
    run(async () => {
      if (withdrawal) {
        await pay(withdrawal, withdrawal.amount);
      }
    });

  const fillMax = () => changeAmount(BankWithdrawalForm.maxAmount(balance));

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="subtitle">Withdraw to bank</ThemedText>

          {step === 'amount' && (
            <View style={styles.section}>
              <ThemedText type="small">
                Balance {money.token(balance, bankWithdrawalCurrency)}
              </ThemedText>
              <Field
                value={amountInput}
                onChangeText={changeAmount}
                placeholder="Amount in pounds"
                keyboardType="decimal-pad"
              />
              <Button label="Max" onPress={fillMax} disabled={balance === 0n} />
              {amountError && <ThemedText type="small">{amountError}</ThemedText>}
              <Button label="Continue" onPress={toBank} disabled={busy || !amountInput.trim() || !view} />
            </View>
          )}

          {step === 'bank' && (
            <View style={styles.section}>
              <Field
                value={sortCodeInput}
                onChangeText={(next) => {
                  setSortCodeInput(next);
                  setBankError(null);
                }}
                placeholder="Sort code (12-34-56)"
                keyboardType="number-pad"
                maxLength={8}
              />
              <Field
                value={accountNumberInput}
                onChangeText={(next) => {
                  setAccountNumberInput(next);
                  setBankError(null);
                }}
                placeholder="Account number (8 digits)"
                keyboardType="number-pad"
                maxLength={8}
              />
              {profile?.hasFullName() && (
                <ThemedText type="small">Paid to an account in your name: {profile.accountName}</ThemedText>
              )}
              {bankError && <ThemedText type="small">{bankError}</ThemedText>}
              <Button label="Continue" onPress={toReview} disabled={busy} />
              <Button label="Back" onPress={() => setStep('amount')} disabled={busy} />
            </View>
          )}

          {step === 'needs-name' && profile && (
            <NameStep profile={profile} onSaved={nameSaved} onBack={() => setStep('bank')} />
          )}

          {step === 'review' && bank && profile && (
            <View style={styles.section}>
              <ThemedText>{BankWithdrawalForm.reviewText(amount, bank, profile.accountName)}</ThemedText>
              <Button label="Confirm" onPress={() => confirm(false)} disabled={busy} />
              <Button label="Back" onPress={() => setStep('bank')} disabled={busy} />
            </View>
          )}

          {step === 'submitted' && (
            <View style={styles.section}>
              {heading !== '' && <ThemedText type="smallBold">{heading}</ThemedText>}
              {withdrawal && <BankWithdrawalRow withdrawal={withdrawal} busy={busy || sending} onFinish={finish} />}
              <Button label="Done" onPress={() => router.back()} disabled={sending} />
            </View>
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
  section: {
    gap: Spacing.two,
  },
});
