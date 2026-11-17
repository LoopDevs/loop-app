import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AmountChip, AmountEntry } from '@/components/purchase-amount';
import { PurchaseTerms, purchaseTermsKey } from '@/components/purchase-terms';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button, Notice } from '@/components/ui/form';
import { ThemedText } from '@/components/ui/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { amountErrorMessage } from '@/ctx/amount-error';
import { normalizeAmount } from '@/ctx/amount-input';
import { ctx, CtxError, type GiftCard } from '@/ctx/client';
import type { Merchant } from '@/ctx/merchant';
import type { Profile } from '@/ctx/profile';
import { useBusyAction } from '@/hooks/use-busy-action';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/native/haptics';
import type { PaymentCurrency } from '@/stellar/network';
import { units } from '@/stellar/units';

type Props = {
  merchant: Merchant;
  profile: Profile;
  activeOrder: GiftCard | null;
  onAmountFocus?: () => void;
};

const payWithChoices: readonly { currency: PaymentCurrency; label: string }[] = [
  { currency: 'XLM', label: 'XLM' },
  { currency: 'XLM.USDC', label: 'USDC' },
];

const payableTickMs = 30_000;

function firstAmount(merchant: Merchant): string {
  return merchant.denominationType === 'fixed' ? (merchant.denominationValues[0] ?? '') : '';
}

export function CryptoCheckout({ merchant, profile, activeOrder, onAmountFocus }: Props) {
  const router = useRouter();
  const theme = useTheme();
  const { busy, message, setMessage, run } = useBusyAction();
  const [amount, setAmount] = useState(firstAmount(merchant));
  const [amountError, setAmountError] = useState<string | null>(null);
  const [payWith, setPayWith] = useState<PaymentCurrency>('XLM');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showingTerms, setShowingTerms] = useState(false);
  const now = useNow(payableTickMs);

  useEffect(() => {
    let current = true;
    AsyncStorage.getItem(purchaseTermsKey(profile.id))
      .catch(() => null)
      .then((accepted) => {
        if (current) {
          setTermsAccepted(accepted === 'yes');
        }
      });
    return () => {
      current = false;
    };
  }, [profile.id]);

  const fiatAmount = normalizeAmount(amount);
  const amountProblem = merchant.amountProblem(amount);
  const saving = merchant.cashbackEstimate(fiatAmount ?? '');
  const range = merchant.rangeLabel();
  const canPay = !busy && fiatAmount !== null && amountProblem === null;

  const changeAmount = (next: string) => {
    setAmount(next);
    setAmountError(null);
    setMessage('');
  };

  const order = () =>
    run(async () => {
      if (!fiatAmount) {
        return;
      }
      setAmountError(null);
      try {
        const created = await ctx.orderGiftCard({
          merchantId: merchant.id,
          fiatAmount,
          fiatCurrency: merchant.currency,
          cryptoCurrency: payWith,
        });
        haptics.tap();
        router.push(`/wallet/${created.id}`);
      } catch (error) {
        haptics.error();
        const amountMessage = amountErrorMessage(error instanceof CtxError ? error.errorName() : undefined, merchant);
        if (!amountMessage) {
          throw error;
        }
        setAmountError(amountMessage);
      }
    });

  const startOrder = () => {
    if (termsAccepted) {
      void order();
      return;
    }
    setShowingTerms(true);
  };

  const agreeAndOrder = () => {
    setTermsAccepted(true);
    setShowingTerms(false);
    AsyncStorage.setItem(purchaseTermsKey(profile.id), 'yes').catch(() => setTermsAccepted(false));
    void order();
  };

  const payable =
    activeOrder !== null &&
    (!activeOrder.paymentUrlExpiration || Date.parse(activeOrder.paymentUrlExpiration) > now);

  if (activeOrder && payable) {
    return (
      <View style={styles.stack}>
        <ThemedText type="heading">Your order is waiting for payment</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {`Your ${merchant.shortAmount(activeOrder.cardFiatAmount)} gift card is ready to pay for.`}
        </ThemedText>
        <Button label="Continue your order" variant="primary" onPress={() => router.push(`/wallet/${activeOrder.id}`)} />
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <ThemedText type="heading">{`Buy a ${merchant.name} gift card`}</ThemedText>
      <View style={styles.hero}>
        {merchant.denominationType === 'fixed' ? (
          <ThemedText type="title" accessibilityLiveRegion="polite" style={styles.fixedAmount}>
            {merchant.shortAmount(amount)}
          </ThemedText>
        ) : (
          <AmountEntry merchant={merchant} value={amount} onChange={changeAmount} onFocus={onAmountFocus} />
        )}
        {range && merchant.denominationType !== 'fixed' && (
          <ThemedText type="caption" themeColor="textSecondary">
            {range}
          </ThemedText>
        )}
        {(amountProblem ?? amountError) && (
          <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite">
            {amountProblem ?? amountError}
          </ThemedText>
        )}
        {saving && (
          <View style={[styles.pill, { backgroundColor: theme.accentSoft }]}>
            <ThemedText type="smallBold" themeColor="success">
              {`You save ${saving}`}
            </ThemedText>
          </View>
        )}
      </View>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {merchant.denominationType === 'fixed'
          ? merchant.denominationValues.map((denomination) => (
              <AmountChip
                key={denomination}
                label={merchant.shortAmount(denomination)}
                selected={amount === denomination}
                onPress={() => changeAmount(denomination)}
              />
            ))
          : merchant
              .quickAmounts()
              .map((quick) => (
                <AmountChip
                  key={quick}
                  label={merchant.shortAmount(quick)}
                  selected={fiatAmount !== null && units.parseTruncated(fiatAmount) === units.parseTruncated(quick)}
                  onPress={() => changeAmount(quick)}
                />
              ))}
      </View>
      <ThemedText type="smallBold">Pay with</ThemedText>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {payWithChoices.map((choice) => (
          <AmountChip
            key={choice.currency}
            label={choice.label}
            selected={payWith === choice.currency}
            onPress={() => setPayWith(choice.currency)}
          />
        ))}
      </View>
      {message !== '' && <Notice message={message} />}
      <Button
        label={busy ? 'Getting your price…' : 'Continue to payment'}
        variant="primary"
        onPress={startOrder}
        disabled={!canPay}
        busy={busy}
      />
      <ThemedText type="small" themeColor="textSecondary">
        You pay the discounted price from your own Stellar wallet. The exact amount shows on the next screen.
      </ThemedText>
      <BottomSheet open={showingTerms} onClose={() => setShowingTerms(false)} title="Before you buy">
        <View style={styles.stack}>
          <PurchaseTerms />
          <Button label="Agree and continue" variant="primary" onPress={agreeAndOrder} disabled={!canPay} />
          <Button label="Not now" variant="quiet" onPress={() => setShowingTerms(false)} />
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.three,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  fixedAmount: {
    fontVariant: ['tabular-nums'],
  },
  pill: {
    alignSelf: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.two,
  },
});
