import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AmountChip, AmountEntry } from '@/components/purchase-amount';
import { PurchaseTerms, purchaseTermsKey } from '@/components/purchase-terms';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button, Notice } from '@/components/ui/form';
import { ThemedText } from '@/components/ui/themed-text';
import { useToast } from '@/components/ui/toast';
import { Radius, Spacing } from '@/constants/theme';
import { amountErrorMessage } from '@/ctx/amount-error';
import { normalizeAmount } from '@/ctx/amount-input';
import { type BankInstitution, BankLink } from '@/ctx/bank-link';
import { BankPayment } from '@/ctx/bank-payment';
import { ctx, CtxError, type GiftCard } from '@/ctx/client';
import { dismissedOrders } from '@/ctx/dismissed-orders';
import type { Merchant } from '@/ctx/merchant';
import { OneTapBuy } from '@/ctx/one-tap-buy';
import type { Profile } from '@/ctx/profile';
import { useBusyAction } from '@/hooks/use-busy-action';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/native/haptics';
import { errorReporting } from '@/ops/error-reporting';
import { units } from '@/stellar/units';

type Props = {
  merchant: Merchant;
  profile: Profile;
  activeOrder: GiftCard | null;
};

type Stage = 'amount' | 'approve' | 'expired' | 'paid' | 'other';

type PayPhase = {
  step: 'ordering' | 'opening';
  viaPicker: boolean;
};

const stageTickMs = 30_000;
const leftNote = 'If you already approved it at your bank, the card will still arrive.';

function firstAmount(merchant: Merchant): string {
  return merchant.denominationType === 'fixed' ? (merchant.denominationValues[0] ?? '') : '';
}

function stageOf(order: GiftCard | null, now: number): Stage {
  if (!order) {
    return 'amount';
  }
  if (order.status !== 'unpaid') {
    return 'paid';
  }
  if (!BankPayment.isBank(order)) {
    return 'other';
  }
  return BankPayment.approvable(order, now) ? 'approve' : 'expired';
}

export function BankCheckout({ merchant, profile, activeOrder }: Props) {
  const router = useRouter();
  const theme = useTheme();
  const toast = useToast();
  const { busy, message, setMessage, run } = useBusyAction();
  const [amount, setAmount] = useState(firstAmount(merchant));
  const [amountError, setAmountError] = useState<string | null>(null);
  const [order, setOrder] = useState<GiftCard | null>(activeOrder);
  const [syncedOrder, setSyncedOrder] = useState(activeOrder);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showingTerms, setShowingTerms] = useState(false);
  const [phase, setPhase] = useState<PayPhase | null>(null);
  const now = useNow(stageTickMs);
  const mounted = useRef(true);
  const resumed = useRef<string | null>(null);
  const differentBank = useRef(false);

  if (activeOrder !== syncedOrder) {
    setSyncedOrder(activeOrder);
    setOrder(activeOrder);
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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
  const estimate = merchant.cashbackEstimate(fiatAmount ?? '');
  const range = merchant.rangeLabel();
  const stage = stageOf(order, now);
  const canPay = !busy && fiatAmount !== null && amountProblem === null;
  const choosingBank = busy && phase?.viaPicker === true;
  const payingWithBank = busy && !choosingBank;
  const busyLabel = (opening: string) => (phase?.step === 'opening' ? opening : 'Setting up…');
  const bankName = profile.bank?.name ?? null;

  const changeAmount = (next: string) => {
    setAmount(next);
    setAmountError(null);
    setMessage('');
  };

  const showCard = (giftCard: GiftCard) => {
    setOrder(null);
    router.push(`/wallet/${giftCard.id}`);
  };

  const dropOrder = (giftCard: GiftCard) => {
    setOrder(null);
    void dismissedOrders.dismiss(giftCard);
  };

  const settle = async (giftCard: GiftCard, note: string) => {
    const fetched = await ctx.giftCard(giftCard.id).catch(() => giftCard);
    if (!mounted.current) {
      return;
    }
    if (fetched.status !== 'unpaid') {
      showCard(fetched);
      return;
    }
    dropOrder(fetched);
    toast(note);
  };

  const rememberBank = (institution: BankInstitution | null) => {
    const update = profile.bankUpdate(institution);
    if (update) {
      ctx.updateUser(update).catch(() => undefined);
    }
  };

  const approve = async (giftCard: GiftCard) => {
    setPhase((current) => ({ step: 'opening', viaPicker: current?.viaPicker ?? false }));
    const token = BankPayment.linkToken(giftCard);
    const link = token ? null : BankPayment.openLink(giftCard);
    if (token && process.env.EXPO_OS !== 'web') {
      const outcome = await BankLink.present(token).catch((error: unknown) => {
        errorReporting.reportError(error, `Bank approval could not open for order ${giftCard.id}`);
        return null;
      });
      if (!mounted.current) {
        return;
      }
      if (outcome?.kind === 'approved') {
        haptics.success();
        rememberBank(outcome.institution);
        showCard(giftCard);
        return;
      }
      if (outcome?.kind === 'left') {
        if (outcome.errorCode) {
          errorReporting.reportMessage(`Bank approval left with ${outcome.errorCode} for order ${giftCard.id}`);
        }
        await settle(giftCard, outcome.displayMessage ?? leftNote);
        return;
      }
      dropOrder(giftCard);
      throw new Error(OneTapBuy.notBoughtMessage);
    }
    const url = link ?? (token ? BankPayment.openLink(giftCard) : null);
    if (url) {
      await openBrowserAsync(url, { presentationStyle: WebBrowserPresentationStyle.AUTOMATIC });
      if (mounted.current) {
        showCard(giftCard);
      }
      return;
    }
    if (BankPayment.linkRefused(giftCard)) {
      errorReporting.reportMessage(`Bank approval link refused for order ${giftCard.id}`);
    }
    throw new Error(OneTapBuy.notBoughtMessage);
  };

  const pay = () =>
    run(async () => {
      if (!fiatAmount) {
        return;
      }
      setAmountError(null);
      setPhase({ step: 'ordering', viaPicker: differentBank.current });
      try {
        let created: GiftCard;
        try {
          created = await ctx.orderGiftCard({
            merchantId: merchant.id,
            fiatAmount,
            fiatCurrency: merchant.currency,
            ...(differentBank.current ? { chooseBank: true } : {}),
          });
        } catch (error) {
          haptics.error();
          const name = error instanceof CtxError ? error.errorName() : undefined;
          const amountMessage = amountErrorMessage(name, merchant);
          if (amountMessage) {
            setAmountError(amountMessage);
            return;
          }
          throw new Error(BankPayment.refusalMessage(name) ?? OneTapBuy.notBoughtMessage);
        }
        if (!mounted.current) {
          return;
        }
        resumed.current = created.id;
        setOrder(created);
        haptics.tap();
        await approve(created);
      } finally {
        setPhase(null);
      }
    });

  const startPay = (chooseBank = false) => {
    differentBank.current = chooseBank;
    if (termsAccepted) {
      void pay();
      return;
    }
    setShowingTerms(true);
  };

  const agreeAndPay = () => {
    setTermsAccepted(true);
    setShowingTerms(false);
    AsyncStorage.setItem(purchaseTermsKey(profile.id), 'yes').catch(() => setTermsAccepted(false));
    void pay();
  };

  const continueApproval = () =>
    run(async () => {
      if (!order) {
        return;
      }
      setPhase({ step: 'ordering', viaPicker: false });
      try {
        const fetched = await ctx.giftCard(order.id);
        if (!mounted.current) {
          return;
        }
        if (fetched.status !== 'unpaid') {
          showCard(fetched);
          return;
        }
        setOrder(fetched);
        await approve(fetched);
      } finally {
        setPhase(null);
      }
    });

  const resume = useEffectEvent((giftCard: GiftCard, orderStage: Stage) => {
    if (orderStage === 'approve') {
      void continueApproval();
    }
    if (orderStage === 'expired') {
      void dismissedOrders.dismiss(giftCard);
    }
  });

  useEffect(() => {
    if (!order || resumed.current === order.id) {
      return;
    }
    resumed.current = order.id;
    resume(order, stage);
  }, [order, stage]);

  if (order && (stage === 'paid' || stage === 'other')) {
    const orderAmount = merchant.shortAmount(order.cardFiatAmount);
    return (
      <View style={styles.stack}>
        <ThemedText type="heading">
          {stage === 'paid' ? 'Your order is on its way' : `Your ${orderAmount} gift card is waiting`}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {stage === 'paid'
            ? `Your ${orderAmount} ${merchant.name} gift card is being prepared.`
            : `Your ${orderAmount} gift card is still being paid for.`}
        </ThemedText>
        {message !== '' && <Notice message={message} />}
        {stage === 'paid' && <Button label="View gift card" variant="primary" onPress={() => showCard(order)} />}
        {stage === 'other' && (
          <Button
            label="Continue your order"
            variant="primary"
            onPress={() => router.push(`/shop/pay/${merchant.slug}`)}
          />
        )}
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
          <AmountEntry merchant={merchant} value={amount} onChange={changeAmount} />
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
        {estimate && (
          <View style={[styles.pill, { backgroundColor: theme.accentSoft }]}>
            <ThemedText type="smallBold" themeColor="success">
              You earn about {estimate} cashback
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
      {stage === 'expired' && <Notice message="The bank approval ran out of time. Start again to buy this card." />}
      {message !== '' && <Notice message={message} />}
      <Button
        label={
          payingWithBank
            ? busyLabel(`Opening ${bankName ?? 'your bank'}…`)
            : fiatAmount && amountProblem === null
              ? `Pay ${merchant.shortAmount(fiatAmount)} ${bankName ? `with ${bankName}` : 'by bank'}`
              : 'Pay by bank'
        }
        variant="primary"
        onPress={() => startPay()}
        disabled={!canPay}
        busy={payingWithBank}
      />
      {bankName && (
        <Button
          label={choosingBank ? busyLabel('Opening your bank list…') : 'Use a different bank'}
          variant="quiet"
          onPress={() => startPay(true)}
          disabled={!canPay}
          busy={choosingBank}
        />
      )}
      <ThemedText type="small" themeColor="textSecondary">
        You approve the payment in your banking app. Cashback is paid in pounds.
      </ThemedText>
      <BottomSheet open={showingTerms} onClose={() => setShowingTerms(false)} title="Before you buy">
        <View style={styles.stack}>
          <PurchaseTerms />
          <Button label="Agree and pay" variant="primary" onPress={agreeAndPay} disabled={!canPay} />
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
