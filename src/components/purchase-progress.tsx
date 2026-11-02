import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import { GiftCardReveal, giftCardRevealMs } from '@/components/gift-card-reveal';
import { Button, Notice } from '@/components/ui/form';
import { ThemedText } from '@/components/ui/themed-text';
import { FontFamily, Motion, Radius, Spacing } from '@/constants/theme';
import { BankPayment } from '@/ctx/bank-payment';
import { BuyPrice } from '@/ctx/buy-price';
import type { GiftCard } from '@/ctx/client';
import { DismissedOrders } from '@/ctx/dismissed-orders';
import { giftCardStatusLabel, outcomeText } from '@/ctx/gift-card-status';
import { CashbackRate, type Merchant } from '@/ctx/merchant';
import type { PaymentState } from '@/ctx/payment-state';
import { Rates } from '@/ctx/rates';
import { useTheme } from '@/hooks/use-theme';
import { money } from '@/money';

type Stage = {
  title: string;
  detail: string;
};

type ProgressProps = {
  merchant: Merchant;
  cardAmount: string;
  order: GiftCard | null;
  payment: PaymentState;
  priceText: string | null;
  busy: boolean;
  onApprove: (order: GiftCard) => void;
  onRetry: () => void;
  onCancel: () => void;
  onDone: () => void;
};

export function PurchaseProgress({
  merchant,
  cardAmount,
  order,
  payment,
  priceText,
  busy,
  onApprove,
  onRetry,
  onCancel,
  onDone,
}: ProgressProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const bank = order ? BankPayment.isBank(order) : payment.kind === 'bank';
  const cashback = order ? CashbackRate.shownFor(order) : merchant.cashbackEstimate(cardAmount);
  const outcome = order ? outcomeText(order, payment.kind === 'confirming') : null;
  const submitted = order?.status === 'paid' || payment.kind === 'confirming';
  const working = payment.kind === 'sending' || payment.kind === 'movingSavings';
  const bankLink = order && payment.kind === 'bank' && payment.linkOpen ? BankPayment.openLink(order) : null;
  const bankExpired = order?.status === 'unpaid' && payment.kind === 'bank' && !payment.linkOpen;
  const bankChecking = order?.status === 'unpaid' && payment.kind === 'bank' && payment.linkOpen && bankLink === null;
  const paymentFailed = order?.status === 'unpaid' && payment.kind === 'failed';
  const failed = paymentFailed || outcome !== null;
  const cancellable = order !== null && !working && !submitted && DismissedOrders.cancellable(order);
  const step = progressStep(order, payment);
  const rail = BankPayment.rail(merchant.currency);
  const stages: Stage[] = [
    bank
      ? {
          title: 'Approve at your bank',
          detail: priceText ? `${priceText} from your ${rail?.bankLabel ?? 'bank'}` : '',
        }
      : {
          title: 'Paying',
          detail: priceText ? `${priceText} from your balance` : '',
        },
    {
      title: 'On its way',
      detail: `${merchant.shortAmount(cardAmount)} ${merchant.name} gift card`,
    },
    {
      title: 'Ready',
      detail: cashback ? `${cashback} cashback to your savings` : 'Your code and how to use it',
    },
  ];
  const headline = failed
    ? paymentFailed
      ? "Your payment didn't go through"
      : giftCardStatusLabel(order?.status ?? 'unpaid')
    : submitted
      ? 'Your gift card is on its way'
      : bankLink
        ? 'Approve the payment in your banking app'
        : bankExpired
          ? 'The bank link has expired'
          : bankChecking
            ? 'Checking with your bank…'
            : 'Buying your gift card…';
  const detail = failed ? null : bankLink || bankExpired ? null : 'This only takes a moment.';

  return (
    <View style={styles.stage}>
      <View style={styles.body}>
        <View style={styles.headline} accessibilityLiveRegion="polite">
          <ThemedText type="subtitle" accessibilityRole="header">
            {headline}
          </ThemedText>
          {detail && (
            <ThemedText type="small" themeColor="textSecondary">
              {detail}
            </ThemedText>
          )}
        </View>
        <ProgressTrack fraction={(step + (failed ? 0 : 0.5)) / stages.length} failed={failed} />
        <View style={styles.stages}>
          {stages.map((stage, index) => (
            <Animated.View
              key={stage.title}
              entering={reduceMotion ? undefined : FadeInDown.delay(index * 90).duration(Motion.state)}
              style={styles.stageRow}>
              <StageIndicator
                state={index < step ? 'done' : index === step ? (failed ? 'failed' : 'active') : 'waiting'}
              />
              <View style={styles.stageText}>
                <ThemedText style={[styles.stageTitle, index > step && { color: theme.textSecondary }]}>
                  {stage.title}
                </ThemedText>
                {stage.detail !== '' && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {stage.detail}
                  </ThemedText>
                )}
              </View>
            </Animated.View>
          ))}
        </View>
      </View>
      <View style={styles.footer}>
        {outcome && <Notice message={outcome} />}
        {paymentFailed && <Notice message="You weren't charged. Try again or pick another way to pay." />}
        {bankExpired && (
          <Notice
            tone="neutral"
            message="Start again to get a new link. If you already approved the payment, your gift card is still on its way."
          />
        )}
        {bankLink && order && (
          <Button label="Approve at your bank" variant="primary" onPress={() => onApprove(order)} disabled={busy} />
        )}
        {(paymentFailed || bankExpired) && (
          <Button
            label={bankExpired ? 'Start again' : 'Try again'}
            variant="primary"
            onPress={onRetry}
            disabled={busy}
          />
        )}
        {cancellable ? (
          <Button label="Cancel" variant="quiet" onPress={onCancel} disabled={busy} />
        ) : (
          !working && <Button label="Done" variant="quiet" onPress={onDone} disabled={busy} />
        )}
      </View>
    </View>
  );
}

type ConfirmProps = {
  merchant: Merchant;
  cardAmount: string;
  price: bigint;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function PurchaseConfirm({ merchant, cardAmount, price, busy, onConfirm, onCancel }: ConfirmProps) {
  return (
    <View style={styles.stage}>
      <View style={styles.body}>
        <View style={styles.headline} accessibilityLiveRegion="polite">
          <ThemedText type="subtitle" accessibilityRole="header">
            The price has changed
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Your {merchant.shortAmount(cardAmount)} {merchant.name} gift card is now {dollars(price)}.
          </ThemedText>
        </View>
      </View>
      <View style={styles.footer}>
        <Button label={`Buy for ${dollars(price)}`} variant="primary" onPress={onConfirm} disabled={busy} />
        <Button label="Cancel" variant="quiet" onPress={onCancel} disabled={busy} />
      </View>
    </View>
  );
}

type DeliveredProps = {
  order: GiftCard;
  onView: () => void;
  onDone: () => void;
};

export function PurchaseDelivered({ order, onView, onDone }: DeliveredProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const cashback = CashbackRate.shownFor(order);
  const detailsDelayMs = giftCardRevealMs + 100;
  const enterAfter = (delayMs: number) =>
    reduceMotion ? undefined : FadeInDown.delay(delayMs).duration(Motion.state).easing(Motion.easeOut);
  return (
    <View style={styles.stage}>
      <View style={[styles.body, styles.delivered]}>
        <Animated.View entering={enterAfter(0)} style={styles.headline} accessibilityLiveRegion="polite">
          <ThemedText type="subtitle" accessibilityRole="header" style={styles.centered}>
            Your gift card is ready
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            Open it to see the code and how to use it.
          </ThemedText>
        </Animated.View>
        <View style={styles.card}>
          <GiftCardReveal giftCard={order} />
        </View>
        {cashback && (
          <Animated.View
            entering={enterAfter(detailsDelayMs)}
            style={[styles.pill, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="smallBold" themeColor="success">
              {cashback} cashback on its way to your savings
            </ThemedText>
          </Animated.View>
        )}
      </View>
      <Animated.View entering={enterAfter(detailsDelayMs + 150)} style={styles.footer}>
        <Button label="View gift card" variant="primary" onPress={onView} />
        <Button label="Done" variant="quiet" onPress={onDone} />
      </Animated.View>
    </View>
  );
}

function ProgressTrack({ fraction, failed }: { fraction: number; failed: boolean }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(fraction);
  useEffect(() => {
    progress.value = reduceMotion ? fraction : withTiming(fraction, { duration: Motion.transition });
  }, [fraction, progress, reduceMotion]);
  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  return (
    <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
      <Animated.View style={[styles.fill, fill, { backgroundColor: failed ? theme.danger : theme.accent }]} />
    </View>
  );
}

function StageIndicator({ state }: { state: 'done' | 'active' | 'failed' | 'waiting' }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  switch (state) {
    case 'done':
      return (
        <Animated.View
          entering={reduceMotion ? undefined : ZoomIn.duration(Motion.state)}
          style={[styles.indicator, { backgroundColor: theme.success }]}>
          <SymbolView
            name={{ ios: 'checkmark', android: 'check', web: 'check' }}
            size={14}
            tintColor={theme.onAccent}
          />
        </Animated.View>
      );
    case 'failed':
      return (
        <View style={[styles.indicator, { backgroundColor: theme.danger }]}>
          <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={14} tintColor={theme.onAccent} />
        </View>
      );
    case 'active':
      return (
        <View style={styles.indicator}>
          <ActivityIndicator color={theme.accent} />
        </View>
      );
    case 'waiting':
      return <View style={[styles.indicator, styles.waiting, { borderColor: theme.borderStrong }]} />;
  }
}

function progressStep(order: GiftCard | null, payment: PaymentState): number {
  if (order?.status === 'fulfilled') {
    return 2;
  }
  if (order?.status === 'paid' || payment.kind === 'confirming') {
    return 1;
  }
  return 0;
}

function dollars(price: bigint): string {
  return money.fiat(BuyPrice.dollars(price), Rates.usd);
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
  },
  body: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.four,
  },
  delivered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    gap: Spacing.two,
  },
  centered: {
    textAlign: 'center',
  },
  track: {
    height: 6,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Radius.pill,
  },
  stages: {
    gap: Spacing.four,
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  indicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waiting: {
    borderWidth: 2,
  },
  stageText: {
    flex: 1,
    gap: Spacing.half,
  },
  stageTitle: {
    fontFamily: FontFamily.semibold,
    fontSize: 17,
    lineHeight: 22,
  },
  card: {
    width: '100%',
    maxWidth: 360,
  },
  pill: {
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
});
