import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Field } from '@/components/form';
import { OrderRowsSkeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { ctx } from '@/ctx/client';
import { useBusyAction } from '@/hooks/use-busy-action';
import { useTheme } from '@/hooks/use-theme';
import { AccountDeletion, WalletFunds, type EraseReason } from '@/session/account-deletion';
import { SmartWallet } from '@/wallet/smart-wallet';

type Step =
  | { kind: 'checking' }
  | { kind: 'unreadable' }
  | { kind: 'funds'; funds: WalletFunds }
  | { kind: 'confirm'; acknowledged: WalletFunds }
  | { kind: 'verify'; acknowledged: WalletFunds; error: string }
  | { kind: 'too-many-attempts'; acknowledged: WalletFunds }
  | { kind: 'blocked'; reasons: EraseReason[] }
  | { kind: 'failed'; acknowledged: WalletFunds; message: string }
  | { kind: 'erased' };

const confirmLines = [
  'Your Loop account and personal details will be deleted.',
  'Gift cards you bought will no longer show in the app; save any codes you still need.',
  "Your wallet address and transactions stay on the Stellar network. That record is public and can't be deleted.",
  'We keep payment records as the law requires.',
];

async function checkFunds(): Promise<WalletFunds> {
  return WalletFunds.check(await ctx.wallets(), (address) => SmartWallet.balancesOf(address));
}

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { busy, message, run } = useBusyAction();
  const [step, setStep] = useState<Step>({ kind: 'checking' });
  const [acknowledgedTicked, setAcknowledgedTicked] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSentAt, setCodeSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const deletion = useMemo(
    () =>
      new AccountDeletion({
        userId: () => ctx.userId(),
        funds: checkFunds,
        erase: (typed) => ctx.eraseAccount(typed),
        removeItem: (key) => AsyncStorage.removeItem(key),
        clearSession: () => ctx.clearSession(),
      }),
    [],
  );

  const loadFunds = useCallback(
    () =>
      run(async () => {
        let funds: WalletFunds;
        try {
          funds = await checkFunds();
        } catch {
          setStep({ kind: 'unreadable' });
          return;
        }
        setStep(funds.isEmpty() ? { kind: 'confirm', acknowledged: WalletFunds.none } : { kind: 'funds', funds });
      }),
    [run],
  );

  useEffect(() => {
    loadFunds();
  }, [loadFunds]);

  const checkWallets = () => {
    setCode('');
    setAcknowledgedTicked(false);
    setStep({ kind: 'checking' });
    return loadFunds();
  };

  const newCodeAt = codeSentAt === null ? null : AccountDeletion.newCodeAt(codeSentAt);

  useEffect(() => {
    if (step.kind !== 'too-many-attempts' || newCodeAt === null || newCodeAt <= now) {
      return;
    }
    const timer = setTimeout(() => setNow(Date.now()), newCodeAt - now);
    return () => clearTimeout(timer);
  }, [step.kind, newCodeAt, now]);

  const sendCode = (acknowledged: WalletFunds) =>
    run(async () => {
      const profile = await ctx.me();
      if (!profile.email) {
        throw new Error('Your account has no email to send a code to. Contact support.');
      }
      await ctx.requestCode(profile.email);
      setEmail(profile.email);
      setCodeSentAt(Date.now());
      setNow(Date.now());
      setCode('');
      setStep({ kind: 'verify', acknowledged, error: '' });
    });

  const erase = (acknowledged: WalletFunds) =>
    run(async () => {
      const result = await deletion.erase(code.trim(), acknowledged);
      switch (result.kind) {
        case 'erased':
          setCode('');
          setStep({ kind: 'erased' });
          return;
        case 'funds-changed':
          await checkWallets();
          return;
        case 'invalid-code':
          setStep({ kind: 'verify', acknowledged, error: AccountDeletion.invalidCodeMessage });
          return;
        case 'too-many-attempts':
          setCode('');
          setNow(Date.now());
          setStep({ kind: 'too-many-attempts', acknowledged });
          return;
        case 'blocked':
          setCode('');
          setStep({ kind: 'blocked', reasons: result.reasons });
          return;
        case 'failed':
          setStep({ kind: 'failed', acknowledged, message: result.message });
          return;
      }
    });

  const errorText = message !== '' && (
    <ThemedText type="small" selectable>
      {message}
    </ThemedText>
  );

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {step.kind === 'checking' && <OrderRowsSkeleton />}

        {step.kind === 'unreadable' && (
          <>
            <ThemedText>{WalletFunds.unreadableMessage}</ThemedText>
            <Button label="Try again" onPress={checkWallets} disabled={busy} />
          </>
        )}

        {step.kind === 'funds' && (
          <>
            <ThemedText>Your wallet still holds money.</ThemedText>
            {step.funds.funded().map(({ address, balances }) => (
              <View key={address} style={styles.wallet}>
                <ThemedText type="small" themeColor="textSecondary" selectable>
                  {address}
                </ThemedText>
                {WalletFunds.amountsOf(balances).map((amount) => (
                  <ThemedText key={amount}>{amount}</ThemedText>
                ))}
              </View>
            ))}
            <Acknowledgment
              label={step.funds.acknowledgment()}
              checked={acknowledgedTicked}
              onToggle={() => setAcknowledgedTicked((ticked) => !ticked)}
            />
            <Button
              label="Delete anyway"
              onPress={() => setStep({ kind: 'confirm', acknowledged: step.funds })}
              disabled={busy || !acknowledgedTicked}
            />
          </>
        )}

        {step.kind === 'confirm' && (
          <>
            {confirmLines.map((line) => (
              <ThemedText key={line}>{line}</ThemedText>
            ))}
            <Button label="Delete my account" onPress={() => sendCode(step.acknowledged)} disabled={busy} />
          </>
        )}

        {step.kind === 'verify' && (
          <>
            <ThemedText>We sent a code to {email}.</ThemedText>
            <Field value={code} onChangeText={setCode} placeholder="Code" keyboardType="number-pad" />
            {step.error !== '' && <ThemedText type="small">{step.error}</ThemedText>}
            <Button
              label="Delete my account"
              onPress={() => erase(step.acknowledged)}
              disabled={busy || !code.trim()}
            />
            {step.error !== '' && (
              <Button label="Send the code again" onPress={() => sendCode(step.acknowledged)} disabled={busy} />
            )}
          </>
        )}

        {step.kind === 'too-many-attempts' && (
          <>
            <ThemedText>{AccountDeletion.tooManyAttemptsMessage}</ThemedText>
            <Button
              label="Send a new code"
              onPress={() => sendCode(step.acknowledged)}
              disabled={busy || (newCodeAt !== null && now < newCodeAt)}
            />
          </>
        )}

        {step.kind === 'blocked' && (
          <>
            {(step.reasons.length > 0 ? step.reasons : [{ code: '' }]).map((reason) => (
              <ThemedText key={`${reason.code}.${reason.currency ?? ''}`}>
                {AccountDeletion.reasonMessage(reason)}
              </ThemedText>
            ))}
            <Button label="Check again" onPress={checkWallets} disabled={busy} />
          </>
        )}

        {step.kind === 'failed' && (
          <>
            <ThemedText selectable>{step.message}</ThemedText>
            <Button label="Try again" onPress={() => erase(step.acknowledged)} disabled={busy} />
          </>
        )}

        {step.kind === 'erased' && (
          <>
            <ThemedText>{AccountDeletion.erasedMessage}</ThemedText>
            <Button label="Done" onPress={() => router.navigate('/')} />
          </>
        )}

        {errorText}
      </ScrollView>
    </ThemedView>
  );
}

function Acknowledgment({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      style={styles.acknowledgment}>
      <View style={[styles.box, { borderColor: theme.text }, checked && { backgroundColor: theme.text }]} />
      <ThemedText style={styles.acknowledgmentText}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.three,
  },
  wallet: {
    gap: Spacing.one,
  },
  acknowledgment: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  box: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderRadius: Spacing.one,
    marginTop: 2,
  },
  acknowledgmentText: {
    flex: 1,
  },
});
