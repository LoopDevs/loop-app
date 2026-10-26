import * as Clipboard from 'expo-clipboard';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button, Field, Notice } from '@/components/form';
import { ListGroup, ListRow } from '@/components/list-row';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { Layout, Motion, Radius, Spacing } from '@/constants/theme';
import { invalidAmountMessage, normalizeAmount } from '@/ctx/amount-input';
import { Profile } from '@/ctx/profile';
import { errorMessage, useBusyAction } from '@/hooks/use-busy-action';
import type { HoldingsView } from '@/hooks/use-holdings';
import { useTheme } from '@/hooks/use-theme';
import { money } from '@/money';
import { network } from '@/stellar/network';
import { units } from '@/stellar/units';
import type { SmartWallet } from '@/wallet/smart-wallet';

type Step = 'amount' | 'method' | 'waiting' | 'done';

const quickAmounts = ['25', '50', '100'];
const checkEveryMs = 4000;
const stepNumbers: Record<Step, number> = { amount: 1, method: 2, waiting: 3, done: 3 };

type AddMoneyProps = {
  wallet: SmartWallet;
  view: HoldingsView | null;
  refresh: () => Promise<void>;
  onClose: () => void;
};

export function AddMoney({ wallet, view, refresh, onClose }: AddMoneyProps) {
  const theme = useTheme();
  const toast = useToast();
  const { busy, message, setMessage, run } = useBusyAction();
  const [step, setStep] = useState<Step>('amount');
  const [input, setInput] = useState('');
  const [received, setReceived] = useState<bigint>(0n);
  const startingTotal = useRef<bigint | null>(null);
  const currency = view?.stable ?? 'USD';
  const total = view?.stable ? view.holdings.totalIn(view.stable) : null;
  const amount = normalizeAmount(input);
  const validAmount = amount !== null && Number(amount) > 0;
  const shownAmount = validAmount ? money.fiat(amount, currency) : '';

  useEffect(() => {
    if (step !== 'waiting') {
      return;
    }
    const timer = setInterval(() => {
      refresh().catch(() => undefined);
    }, checkEveryMs);
    return () => clearInterval(timer);
  }, [step, refresh]);

  useEffect(() => {
    if (step !== 'waiting' || total === null || startingTotal.current === null) {
      return;
    }
    if (total > startingTotal.current) {
      setReceived(total - startingTotal.current);
      setStep('done');
    }
  }, [step, total]);

  const startWaiting = () => {
    startingTotal.current = total ?? 0n;
    setStep('waiting');
  };

  const copyDetails = async () => {
    await Clipboard.setStringAsync(wallet.address);
    toast('Account details copied');
    startWaiting();
  };

  const addTestMoney = () =>
    run(async () => {
      startWaiting();
      try {
        await wallet.fundWithFriendbot();
        await refresh();
      } catch (error) {
        setStep('method');
        setMessage(errorMessage(error));
      }
    });

  return (
    <View
      style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
      accessibilityLabel="Add money">
      <View style={styles.header}>
        <ThemedText type="caption" themeColor="textSecondary">
          {`Step ${stepNumbers[step]} of 3`}
        </ThemedText>
        <Button label="Close" variant="quiet" onPress={onClose} />
      </View>

      {step === 'amount' && (
        <Animated.View key="amount" entering={FadeIn.duration(Motion.state)} style={styles.step}>
          <ThemedText type="heading" accessibilityRole="header">
            How much do you want to add?
          </ThemedText>
          <Field
            placeholder={`Amount in ${Profile.currencyLabel(currency)}`}
            value={input}
            onChangeText={setInput}
            keyboardType="decimal-pad"
            returnKeyType="next"
            onSubmitEditing={() => validAmount && setStep('method')}
            autoFocus
          />
          <View style={styles.chips}>
            {quickAmounts.map((quick) => (
              <View key={quick} style={styles.chip}>
                <Button
                  label={money.fiat(quick, currency)}
                  selected={amount === quick}
                  onPress={() => setInput(quick)}
                />
              </View>
            ))}
          </View>
          {input !== '' && amount === null && (
            <ThemedText type="small" themeColor="danger">
              {invalidAmountMessage}
            </ThemedText>
          )}
          <Button
            label="Continue"
            variant="primary"
            onPress={() => setStep('method')}
            disabled={!validAmount}
          />
        </Animated.View>
      )}

      {step === 'method' && (
        <Animated.View key="method" entering={FadeIn.duration(Motion.state)} style={styles.step}>
          <ThemedText type="heading" accessibilityRole="header">
            {`How do you want to pay ${shownAmount}?`}
          </ThemedText>
          <ListGroup>
            {network.friendbotUrl !== null && (
              <ListRow
                label="Test money"
                detail="Instant, for trying Loop"
                onPress={addTestMoney}
                disabled={busy}
              />
            )}
            <ListRow
              label="Transfer from another app"
              detail="Copy your Loop account details"
              onPress={copyDetails}
            />
          </ListGroup>
          <ThemedText type="small" themeColor="textSecondary">
            {`Send ${shownAmount} in ${Profile.currencyLabel(currency)}s from an app that holds digital money. Paste your Loop account details as the recipient.`}
          </ThemedText>
          {message !== '' && <Notice message={message} />}
          <Button label="Back" variant="quiet" onPress={() => setStep('amount')} />
        </Animated.View>
      )}

      {step === 'waiting' && (
        <Animated.View key="waiting" entering={FadeIn.duration(Motion.state)} style={styles.step}>
          <ThemedText type="heading" accessibilityRole="header">
            Waiting for your money
          </ThemedText>
          <Skeleton width="100%" height={4} color={theme.accent} />
          <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
            It shows in your balance as soon as it arrives. You can close this and carry on.
          </ThemedText>
          <Button label="Pay another way" variant="quiet" onPress={() => setStep('method')} />
        </Animated.View>
      )}

      {step === 'done' && (
        <Animated.View key="done" entering={FadeIn.duration(Motion.state)} style={styles.step}>
          <SymbolView
            name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }}
            size={40}
            tintColor={theme.success}
          />
          <ThemedText type="heading" accessibilityRole="header" accessibilityLiveRegion="polite">
            {`${money.ctx(units.format(received, units.decimals), currency)} added`}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {"It's in your balance and ready to spend on gift cards."}
          </ThemedText>
          <Button label="Done" variant="primary" onPress={onClose} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    gap: Spacing.three,
    borderRadius: Radius.control,
    borderWidth: 1,
    width: '100%',
    maxWidth: Layout.sheetWidth,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  step: {
    gap: Spacing.three,
  },
  chips: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  chip: {
    flex: 1,
  },
});
