import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button, Field } from '@/components/form';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { ListGroup, ListRow } from '@/components/list-row';
import { PageHeader } from '@/components/page-header';
import { PreviewBadge } from '@/components/preview-badge';
import { SiteFooter } from '@/components/site-footer';
import { StatusTracker } from '@/components/status-tracker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Layout, Motion, ScrollEndInset, Spacing } from '@/constants/theme';
import { normalizeAmount } from '@/ctx/amount-input';
import { money } from '@/money';
import { strings } from '@/strings';

type Step = 'bank' | 'amount' | 'review' | 'status';

const minimumDollars = 10;
const maximumDollars = 1000;
const currency = 'USD';
const cashOutSteps = [
  { label: 'Requested', detail: 'We have your request.' },
  { label: 'Reviewing', detail: 'We check every cash out to keep your money safe.' },
  { label: 'Paid', detail: 'Usually within 1 working day.' },
];

function digits(input: string, length: number): string {
  return input.replace(/\D/g, '').slice(0, length);
}

function shownSortCode(sortCode: string): string {
  return sortCode.match(/.{1,2}/g)?.join('-') ?? '';
}

export default function CashOutScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('bank');
  const [name, setName] = useState('');
  const [sortCode, setSortCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [input, setInput] = useState('');

  const bankReady = name.trim().length > 1 && sortCode.length === 6 && accountNumber.length === 8;
  const amount = normalizeAmount(input);
  const amountNumber = amount === null ? 0 : Number(amount);
  const amountReady = amountNumber >= minimumDollars && amountNumber <= maximumDollars;
  const shownAmount = amount === null ? '' : money.fiat(amount, currency);
  const range = `${money.fiat(String(minimumDollars), currency)} to ${money.fiat(String(maximumDollars), currency)}`;

  return (
    <ThemedView style={styles.container}>
      <StatusBar style="dark" />
      <KeyboardAvoid>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <PageHeader title="Cash out to your bank" belowNavigationHeader accessory={<PreviewBadge />} />
        <View style={styles.body}>
          {step === 'bank' && (
            <Animated.View key="bank" entering={FadeIn.duration(Motion.state)} style={styles.step}>
              <ThemedText type="heading" accessibilityRole="header">
                Where should we send it?
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                A UK bank account in your name.
              </ThemedText>
              <Field
                label={strings.field.accountName}
                value={name}
                onChangeText={setName}
                autoComplete="name"
              />
              <Field
                label={strings.field.sortCode}
                value={shownSortCode(sortCode)}
                onChangeText={(text) => setSortCode(digits(text, 6))}
                keyboardType="number-pad"
              />
              <Field
                label={strings.field.accountNumber}
                value={accountNumber}
                onChangeText={(text) => setAccountNumber(digits(text, 8))}
                keyboardType="number-pad"
              />
              <Button label="Continue" variant="primary" onPress={() => setStep('amount')} disabled={!bankReady} />
            </Animated.View>
          )}

          {step === 'amount' && (
            <Animated.View key="amount" entering={FadeIn.duration(Motion.state)} style={styles.step}>
              <ThemedText type="heading" accessibilityRole="header">
                How much?
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {`You can cash out ${range} at a time.`}
              </ThemedText>
              <Field
                label={strings.field.amountInDollars}
                value={input}
                onChangeText={setInput}
                keyboardType="decimal-pad"
              />
              {input !== '' && !amountReady && (
                <ThemedText type="small" themeColor="danger">
                  {`Enter an amount from ${range}`}
                </ThemedText>
              )}
              <Button label="Review" variant="primary" onPress={() => setStep('review')} disabled={!amountReady} />
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
                <ListRow label="To" value={name.trim()} trailing="none" />
                <ListRow label="Sort code" value={shownSortCode(sortCode)} trailing="none" />
                <ListRow label="Account number" value={accountNumber} trailing="none" />
              </ListGroup>
              <Button label={`Cash out ${shownAmount}`} variant="primary" onPress={() => setStep('status')} />
              <Button label="Back" variant="quiet" onPress={() => setStep('amount')} />
            </Animated.View>
          )}

          {step === 'status' && (
            <Animated.View key="status" entering={FadeIn.duration(Motion.state)} style={styles.step}>
              <ThemedText type="heading" accessibilityRole="header" accessibilityLiveRegion="polite">
                {`${shownAmount} is on its way`}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {`To ${name.trim()}, account ending ${accountNumber.slice(-4)}.`}
              </ThemedText>
              <StatusTracker steps={cashOutSteps} current={1} />
              <Button label="Done" variant="primary" onPress={() => router.navigate('/wallet')} />
            </Animated.View>
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
});
