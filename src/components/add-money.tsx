import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button, Field, Notice } from '@/components/form';
import { ListGroup, ListRow } from '@/components/list-row';
import { PreviewBadge } from '@/components/preview-badge';
import { QrCode } from '@/components/qr-code';
import { Skeleton } from '@/components/skeleton';
import { StatusTracker } from '@/components/status-tracker';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { Layout, Motion, Radius, Spacing } from '@/constants/theme';
import { invalidAmountMessage, normalizeAmount } from '@/ctx/amount-input';
import { errorMessage, useBusyAction } from '@/hooks/use-busy-action';
import type { HoldingsView } from '@/hooks/use-holdings';
import { useTheme } from '@/hooks/use-theme';
import { money } from '@/money';
import { network } from '@/stellar/network';
import { units } from '@/stellar/units';
import { PayRequest } from '@/wallet/pay-request';
import type { SmartWallet } from '@/wallet/smart-wallet';

type Step = 'method' | 'app' | 'waiting' | 'done' | 'bank-amount' | 'bank-details' | 'bank-sent';

const quickAmounts = ['25', '50', '100'];
const checkEveryMs = 4000;
const currency = 'USD';
const bankDetails = {
  name: 'Loop Finance',
  sortCode: '00-00-00',
  accountNumber: '00000000',
};
const bankSteps = [
  { label: 'Transfer sent', detail: 'You sent it from your bank.' },
  { label: 'Received', detail: 'Usually within 2 hours.' },
  { label: 'Added to your balance', detail: 'Ready to spend on gift cards.' },
];

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
  const [step, setStep] = useState<Step>('method');
  const [input, setInput] = useState('');
  const [received, setReceived] = useState<bigint>(0n);
  const [startingTotal, setStartingTotal] = useState<bigint | null>(null);
  const total = view?.stable ? view.holdings.totalIn(view.stable) : null;
  const amount = normalizeAmount(input);
  const validAmount = amount !== null && Number(amount) > 0;
  const shownAmount = validAmount ? money.fiat(amount, currency) : '';
  const payRequest = new PayRequest(wallet.address, validAmount ? amount : null).uri();
  const reference = `LOOP${wallet.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase()}`;

  useEffect(() => {
    if (step !== 'waiting') {
      return;
    }
    const timer = setInterval(() => {
      refresh().catch(() => undefined);
    }, checkEveryMs);
    return () => clearInterval(timer);
  }, [step, refresh]);

  if (step === 'waiting' && total !== null && startingTotal !== null && total > startingTotal) {
    setReceived(total - startingTotal);
    setStep('done');
  }

  const startWaiting = () => {
    setStartingTotal(total ?? 0n);
    setStep('waiting');
  };

  const copy = async (text: string, what: string) => {
    await Clipboard.setStringAsync(text);
    toast(`${what} copied`);
  };

  const openApp = async () => {
    try {
      await Linking.openURL(payRequest);
      startWaiting();
    } catch {
      setMessage("Couldn't open an app for this. Copy your account details instead.");
    }
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

  const amountPicker = (onSubmit: () => void) => (
    <>
      <Field
        placeholder="Amount in dollars"
        value={input}
        onChangeText={setInput}
        keyboardType="decimal-pad"
        returnKeyType="next"
        onSubmitEditing={onSubmit}
        accessibilityLabel="Amount in dollars"
      />
      <View style={styles.chips}>
        {quickAmounts.map((quick) => (
          <View key={quick} style={styles.chip}>
            <Button label={money.fiat(quick, currency)} selected={amount === quick} onPress={() => setInput(quick)} />
          </View>
        ))}
      </View>
      {input !== '' && amount === null && (
        <ThemedText type="small" themeColor="danger">
          {invalidAmountMessage}
        </ThemedText>
      )}
    </>
  );

  return (
    <View
      style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
      accessibilityLabel="Add money">
      <View style={styles.header}>
        {step.startsWith('bank') ? <PreviewBadge /> : <View />}
        <Button label="Close" variant="quiet" onPress={onClose} />
      </View>

      {step === 'method' && (
        <Animated.View key="method" entering={FadeIn.duration(Motion.state)} style={styles.step}>
          <ThemedText type="heading" accessibilityRole="header">
            How do you want to add money?
          </ThemedText>
          <ListGroup>
            <ListRow
              label="From another app"
              detail="Send dollars from an app you already use"
              onPress={() => setStep('app')}
            />
            <ListRow
              label="From your bank"
              detail="Bank transfer, usually within 2 hours"
              onPress={() => setStep('bank-amount')}
            />
            {network.friendbotUrl !== null && (
              <ListRow label="Test money" detail="Instant, for trying Loop" onPress={addTestMoney} disabled={busy} />
            )}
          </ListGroup>
          {message !== '' && <Notice message={message} />}
        </Animated.View>
      )}

      {step === 'app' && (
        <Animated.View key="app" entering={FadeIn.duration(Motion.state)} style={styles.step}>
          <ThemedText type="heading" accessibilityRole="header">
            Add dollars from your app
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Choose an amount if you like, then open your app to send it. You can also change the amount there.
          </ThemedText>
          {amountPicker(openApp)}
          <Button
            label={shownAmount ? `Open my app to send ${shownAmount}` : 'Open my app'}
            variant="primary"
            onPress={openApp}
            disabled={input !== '' && amount === null}
          />
          <QrCode value={payRequest} accessibilityLabel="Code to scan with your app" />
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            On a computer? Scan this with your phone.
          </ThemedText>
          <ListGroup footer="If your app can't open the request, send dollars to these account details instead.">
            <ListRow
              label="Copy account details"
              detail={`${wallet.address.slice(0, 6)}…${wallet.address.slice(-6)}`}
              trailing="none"
              onPress={async () => {
                await copy(wallet.address, 'Account details');
                startWaiting();
              }}
            />
          </ListGroup>
          {message !== '' && <Notice message={message} />}
          <Button label="I've sent it" onPress={startWaiting} />
          <Button label="Back" variant="quiet" onPress={() => setStep('method')} />
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
          <Button label="Add money another way" variant="quiet" onPress={() => setStep('method')} />
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
            {`${money.ctx(units.format(received, units.decimals), view?.stable ?? currency)} added`}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {"It's in your balance and ready to spend on gift cards."}
          </ThemedText>
          <Button label="Done" variant="primary" onPress={onClose} />
        </Animated.View>
      )}

      {step === 'bank-amount' && (
        <Animated.View key="bank-amount" entering={FadeIn.duration(Motion.state)} style={styles.step}>
          <ThemedText type="heading" accessibilityRole="header">
            How much do you want to add?
          </ThemedText>
          {amountPicker(() => validAmount && setStep('bank-details'))}
          <Button
            label="Continue"
            variant="primary"
            onPress={() => setStep('bank-details')}
            disabled={!validAmount}
          />
          <Button label="Back" variant="quiet" onPress={() => setStep('method')} />
        </Animated.View>
      )}

      {step === 'bank-details' && (
        <Animated.View key="bank-details" entering={FadeIn.duration(Motion.state)} style={styles.step}>
          <ThemedText type="heading" accessibilityRole="header">
            {`Send ${shownAmount} by bank transfer`}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Use these details in your banking app. Add the reference so we know it&apos;s you.
          </ThemedText>
          <ListGroup>
            <ListRow label="Name" value={bankDetails.name} trailing="none" />
            <CopyRow label="Sort code" value={bankDetails.sortCode} onCopy={copy} />
            <CopyRow label="Account number" value={bankDetails.accountNumber} onCopy={copy} />
            <CopyRow label="Reference" value={reference} onCopy={copy} />
          </ListGroup>
          <Button label="I've sent it" variant="primary" onPress={() => setStep('bank-sent')} />
          <Button label="Back" variant="quiet" onPress={() => setStep('bank-amount')} />
        </Animated.View>
      )}

      {step === 'bank-sent' && (
        <Animated.View key="bank-sent" entering={FadeIn.duration(Motion.state)} style={styles.step}>
          <ThemedText type="heading" accessibilityRole="header" accessibilityLiveRegion="polite">
            {"We'll add it when it arrives"}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {`${shownAmount} shows in your balance as soon as your bank sends it.`}
          </ThemedText>
          <View style={[styles.tracker, { borderColor: theme.border }]}>
            <StatusTracker steps={bankSteps} current={1} />
          </View>
          <Button label="Done" variant="primary" onPress={onClose} />
        </Animated.View>
      )}
    </View>
  );
}

type CopyRowProps = {
  label: string;
  value: string;
  onCopy: (text: string, what: string) => void;
};

function CopyRow({ label, value, onCopy }: CopyRowProps) {
  const theme = useTheme();
  return (
    <ListRow label={label} value={value} trailing="none" onPress={() => onCopy(value, label)}>
      <SymbolView
        name={{ ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' }}
        size={16}
        tintColor={theme.accent}
        accessibilityLabel={`Copy ${label.toLowerCase()}`}
      />
    </ListRow>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    gap: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
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
  centered: {
    textAlign: 'center',
  },
  tracker: {
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
