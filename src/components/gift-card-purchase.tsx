import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePreventRemove, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Field } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { Spacing } from '@/constants/theme';
import { amountErrorMessage } from '@/ctx/amount-error';
import { invalidAmountMessage, normalizeAmount } from '@/ctx/amount-input';
import { ctx, CtxError, type GiftCard } from '@/ctx/client';
import { currencyRefusalMessage, refusesCurrency } from '@/ctx/currency-refusal';
import { InFlightPayments } from '@/ctx/in-flight-payments';
import {
  giftCardStatusLabel,
  isHiddenFromHistory,
  outcomeText,
  pollIntervalMs,
  settledStatuses,
} from '@/ctx/gift-card-status';
import type { Merchant } from '@/ctx/merchant';
import { PaymentSender } from '@/ctx/payment-sender';
import {
  canPay,
  landingClosed,
  needsNewPrice,
  resumedPaymentState,
  sentTransactionOutcome,
  type PaymentState,
  type PayRejection,
} from '@/ctx/payment-state';
import { SentPayments } from '@/ctx/sent-payments';
import { PriceWindow } from '@/ctx/price-window';
import { Rates } from '@/ctx/rates';
import { errorMessage, useBusyAction } from '@/hooks/use-busy-action';
import { useHoldings } from '@/hooks/use-holdings';
import { money } from '@/money';
import { haptics } from '@/native/haptics';
import { network, type PaymentCurrency, type Token } from '@/stellar/network';
import { soroban } from '@/stellar/soroban';
import { units } from '@/stellar/units';
import { holdCriticalReload } from '@/updates/update-checker';
import type { Coverage, Holdings } from '@/wallet/holdings';
import { SavingsTopUp, type PendingWithdrawal, type TopUpOutcome } from '@/wallet/savings-top-up';
import type { SmartWallet } from '@/wallet/smart-wallet';

type Props = {
  merchant: Merchant;
  wallet: SmartWallet;
};

type SentTransaction = {
  txId?: string;
  expiryLedger?: number;
};

async function sentPaymentFailure(
  giftCard: GiftCard,
  wallet: SmartWallet,
  { txId, expiryLedger }: SentTransaction,
): Promise<PaymentState | null> {
  if (txId) {
    return sentTransactionOutcome(await soroban.transaction(txId), expiryLedger) === 'failed'
      ? { kind: 'failed' }
      : null;
  }
  const token = network.tokens.find((candidate) => candidate.currency === giftCard.paymentCryptoCurrency);
  if (expiryLedger === undefined || !token || !landingClosed(await soroban.latestLedger(), expiryLedger)) {
    return null;
  }
  if (await wallet.paymentLanded(token, orderPrice(giftCard), expiryLedger)) {
    return null;
  }
  return { kind: 'failed', contactSupport: true };
}

function payRejection(error: unknown): PayRejection | undefined {
  if (!(error instanceof CtxError)) {
    return undefined;
  }
  return {
    status: error.status,
    errorName: error.errorName(),
    message: error.bodyField('message'),
    txId: error.bodyField('txId'),
  };
}

const sentPayments = new SentPayments(AsyncStorage);
const paymentSender = new PaymentSender(sentPayments, payRejection);
const pendingTopUps = new Map<string, PendingWithdrawal>();
const inFlightPayments = new InFlightPayments();

export function GiftCardPurchase({ merchant, wallet }: Props) {
  const router = useRouter();
  const { busy, message, setMessage, run } = useBusyAction();
  const [amount, setAmount] = useState(firstAmount(merchant));
  const [amountError, setAmountError] = useState<string | null>(null);
  const [chosenCurrency, setChosenCurrency] = useState<PaymentCurrency | null>(null);
  const [refusedCurrencies, setRefusedCurrencies] = useState<ReadonlySet<PaymentCurrency>>(new Set());
  const [order, setOrder] = useState<GiftCard | null>(null);
  const [payment, setPayment] = useState<PaymentState>({ kind: 'ready' });
  const { view, refresh } = useHoldings(wallet);
  const toast = useToast();

  const currencies = network.tokens.map((token) => token.currency);
  const stable = view?.stable ?? Rates.usd;
  const currency =
    chosenCurrency ?? view?.holdings.preferredCurrency(currencies, stable, refusedCurrencies) ?? null;

  const following = useRef(0);
  const paying = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    refresh().catch((error: unknown) => setMessage(errorMessage(error)));
  }, [refresh, setMessage]);

  usePreventRemove(payment.kind === 'sending' || payment.kind === 'movingSavings', () =>
    toast('Wait until the payment is sent'),
  );

  const stopFollowing = () => {
    following.current += 1;
  };

  const followOrder = useCallback(
    async (giftCard: GiftCard, sent?: SentTransaction) => {
      const generation = ++following.current;
      const isCurrent = () => following.current === generation;
      let current = giftCard;
      while (isCurrent() && !settledStatuses.includes(current.status)) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        try {
          current = await ctx.giftCard(current.id);
        } catch {
          continue;
        }
        if (!isCurrent()) {
          return;
        }
        const { status, paymentStatus } = current;
        setOrder((held) => held && { ...held, status, paymentStatus });
        if (current.status !== 'unpaid' || !sent) {
          continue;
        }
        let failure: PaymentState | null;
        try {
          failure = await sentPaymentFailure(current, wallet, {
            txId: sent.txId ?? current.paymentCryptoTxId,
            expiryLedger: sent.expiryLedger,
          });
        } catch {
          continue;
        }
        if (failure) {
          if (isCurrent()) {
            setPayment(failure);
          }
          return;
        }
      }
    },
    [wallet],
  );

  const resumeOrder = useCallback(
    () =>
      run(async () => {
        let giftCard = await ctx.activeGiftCard(merchant.id);
        while (giftCard && inFlightPayments.has(giftCard.paymentId)) {
          setOrder(giftCard);
          setPayment({ kind: 'sending' });
          await inFlightPayments.settled(giftCard.paymentId);
          if (!mounted.current) {
            return;
          }
          giftCard = (await ctx.activeGiftCard(merchant.id)) ?? giftCard;
        }
        if (!giftCard) {
          return;
        }
        const resumed = resumedPaymentState(giftCard, await sentPayments.get(giftCard.paymentId));
        setOrder(giftCard);
        setPayment(resumed);
        if (resumed.kind === 'confirming' || giftCard.status === 'paid') {
          void followOrder(giftCard, resumed.kind === 'confirming' ? resumed : undefined);
        }
      }),
    [run, followOrder, merchant.id],
  );

  useEffect(() => {
    resumeOrder();
    return () => {
      following.current += 1;
    };
  }, [resumeOrder]);

  const changeAmount = (next: string) => {
    setAmount(next);
    setAmountError(null);
  };

  const showNewOrder = (giftCard: GiftCard) => {
    setOrder(giftCard);
    setPayment({ kind: 'ready' });
  };

  const createOrder = () =>
    run(async () => {
      const payWith = currency;
      if (!payWith) {
        return;
      }
      const fiatAmount = normalizeAmount(amount);
      if (!fiatAmount) {
        setAmountError(invalidAmountMessage);
        return;
      }
      try {
        showNewOrder(
          await ctx.orderGiftCard({
            merchantId: merchant.id,
            fiatAmount,
            fiatCurrency: merchant.currency,
            cryptoCurrency: payWith,
          }),
        );
      } catch (error) {
        if (!(error instanceof CtxError)) {
          throw error;
        }
        const amountMessage = amountErrorMessage(error.errorName(), merchant);
        if (amountMessage) {
          setAmountError(amountMessage);
          return;
        }
        const refusal = currencyRefusalMessage(error.errorName(), tokenSymbol(payWith));
        if (!refusal) {
          throw error;
        }
        if (refusesCurrency(error.errorName())) {
          setRefusedCurrencies((refused) => new Set([...refused, payWith]));
          setChosenCurrency(null);
        }
        setMessage(refusal);
      }
    });

  const getNewPrice = () =>
    run(async () => {
      if (!order) {
        return;
      }
      const token = network.tokens.find((candidate) => candidate.currency === order.paymentCryptoCurrency);
      if (!token) {
        throw new Error('This order is priced in a currency this wallet cannot pay');
      }
      stopFollowing();
      showNewOrder(
        await ctx.orderGiftCard({
          merchantId: order.merchantId,
          fiatAmount: order.cardFiatAmount,
          fiatCurrency: order.cardFiatCurrency,
          cryptoCurrency: token.currency,
        }),
      );
    });

  const sendPayment = async (giftCard: GiftCard): Promise<PaymentState> => {
    try {
      return await paymentSender.send(giftCard.paymentId, () => wallet.pay(giftCard));
    } catch (error) {
      setPayment({ kind: 'ready' });
      throw error;
    }
  };

  const topUpFromSavings = async (giftCard: GiftCard, price: bigint): Promise<boolean> => {
    setPayment({ kind: 'movingSavings' });
    let outcome: TopUpOutcome;
    try {
      outcome = await wallet
        .savingsTopUp()
        .run(price, PriceWindow.of(giftCard), pendingTopUps.get(wallet.address));
    } catch (error) {
      setPayment({ kind: 'ready' });
      throw error;
    } finally {
      refresh().catch((error: unknown) => setMessage(errorMessage(error)));
    }
    if (outcome.kind === 'stillMoving') {
      pendingTopUps.set(wallet.address, outcome.withdrawal);
    } else {
      pendingTopUps.delete(wallet.address);
    }
    if (outcome.kind === 'covered') {
      return true;
    }
    const text = SavingsTopUp.message(outcome, tokenSymbol(SavingsTopUp.currency));
    if (outcome.kind === 'priceClosing' || outcome.kind === 'priceExpired') {
      setPayment({ kind: 'priceExpired' });
      setMessage(text);
    } else {
      setPayment({ kind: 'notSent', detail: text });
    }
    return false;
  };

  const pay = async () => {
    if (paying.current || !order || !canPay(order, payment) || inFlightPayments.has(order.paymentId)) {
      return;
    }
    const coverage = orderCoverage(order, view?.holdings ?? null);
    const toppingUp = coverage?.kind === 'savings' || hasPendingTopUp(order, wallet);
    if (coverage?.kind === 'short' && !toppingUp) {
      return;
    }
    const topUpPrice = toppingUp ? orderPrice(order) : null;
    paying.current = true;
    try {
      await run(async () => {
        const task = inFlightPayments.start(order.paymentId, () =>
          holdCriticalReload(async () => {
            const recorded = await paymentSender.recorded(order.paymentId);
            if (recorded) {
              return recorded;
            }
            if (topUpPrice !== null && !(await topUpFromSavings(order, topUpPrice))) {
              return null;
            }
            setPayment({ kind: 'sending' });
            return sendPayment(order);
          }),
        );
        const next = task && (await task);
        if (!next) {
          haptics.error();
          return;
        }
        setPayment(next);
        if (next.kind === 'confirming') {
          haptics.success();
          toast('Payment sent');
          if (mounted.current) {
            void followOrder(order, next);
          }
        } else {
          haptics.error();
        }
      });
    } finally {
      paying.current = false;
    }
  };

  const startOver = () => {
    stopFollowing();
    setMessage('');
    setOrder(null);
    setPayment({ kind: 'ready' });
    changeAmount(firstAmount(merchant));
  };

  const finish = () => {
    if (order && !isHiddenFromHistory(order)) {
      router.push(`/orders/${order.id}`, { withAnchor: true });
    }
    startOver();
  };

  const errorText = message !== '' && (
    <ThemedText type="small" selectable>
      {message}
    </ThemedText>
  );

  if (order) {
    return (
      <View style={styles.section}>
        <OrderView
          order={order}
          coverage={orderCoverage(order, view?.holdings ?? null)}
          topUpPending={hasPendingTopUp(order, wallet)}
          payment={payment}
          busy={busy}
          onPay={pay}
          onNewPrice={getNewPrice}
          onDone={finish}
        />
        {errorText}
      </View>
    );
  }

  const estimate = merchant.cashbackEstimate(normalizeAmount(amount) ?? '');
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">Buy a gift card</ThemedText>
      <ThemedText type="small">{denominationHint(merchant)}</ThemedText>
      {estimate && <ThemedText type="small">You&apos;ll earn about {estimate} in cashback</ThemedText>}
      {merchant.denominationType === 'fixed' ? (
        <View style={styles.row}>
          {merchant.denominations.map((denomination) => (
            <Button
              key={denomination}
              label={denomination}
              onPress={() => changeAmount(denomination)}
              selected={amount === denomination}
            />
          ))}
        </View>
      ) : (
        <Field
          value={amount}
          onChangeText={changeAmount}
          placeholder={`Amount in ${merchant.currency}`}
          keyboardType={merchant.denominationType === 'min-max-major' ? 'number-pad' : 'decimal-pad'}
        />
      )}
      {amountError && <ThemedText type="small">{amountError}</ThemedText>}
      <ThemedText type="small">Pay with</ThemedText>
      <View style={styles.row}>
        {network.tokens.map((token) => (
          <Button
            key={token.currency}
            label={tokenLabel(token, view?.holdings ?? null)}
            onPress={() => setChosenCurrency(token.currency)}
            selected={currency === token.currency}
            disabled={refusedCurrencies.has(token.currency) || view?.holdings.spendable(token.currency) === 0n}
          />
        ))}
      </View>
      <Button label="Get price" onPress={createOrder} disabled={busy || !amount.trim() || !currency} />
      {errorText}
    </View>
  );
}

function firstAmount(merchant: Merchant): string {
  return merchant.denominationType === 'fixed' ? (merchant.denominations[0] ?? '') : '';
}

function tokenSymbol(currency: string): string {
  return network.tokens.find((token) => token.currency === currency)?.symbol ?? currency;
}

function tokenLabel(token: Token, holdings: Holdings | null): string {
  return holdings ? `${token.symbol} ${money.token(holdings.spendable(token.currency), token.currency)}` : token.symbol;
}

function orderPrice(order: GiftCard): bigint | null {
  if (!order.paymentCryptoAmount) {
    return null;
  }
  try {
    return units.parse(order.paymentCryptoAmount);
  } catch {
    return null;
  }
}

function orderCoverage(order: GiftCard, holdings: Holdings | null): Coverage | null {
  const price = orderPrice(order);
  if (!holdings || price === null || !order.paymentCryptoCurrency) {
    return null;
  }
  return holdings.coverage(order.paymentCryptoCurrency, price);
}

function hasPendingTopUp(order: GiftCard, wallet: SmartWallet): boolean {
  return order.paymentCryptoCurrency === SavingsTopUp.currency && pendingTopUps.has(wallet.address);
}

function payLabel(price: string, coverage: Coverage | null): string {
  if (coverage?.kind !== 'savings') {
    return `Pay ${price}`;
  }
  return `Pay ${price} (uses ${money.token(coverage.fromSavings, SavingsTopUp.currency)} from savings)`;
}

type OrderViewProps = {
  order: GiftCard;
  coverage: Coverage | null;
  topUpPending: boolean;
  payment: PaymentState;
  busy: boolean;
  onPay: () => void;
  onNewPrice: () => void;
  onDone: () => void;
};

function OrderView({ order, coverage, topUpPending, payment, busy, onPay, onNewPrice, onDone }: OrderViewProps) {
  const card = `${money.ctx(order.cardFiatAmount, order.cardFiatCurrency)} ${order.merchantName}`;
  const price = money.payment(order.paymentCryptoAmount ?? '', order.paymentCryptoCurrency ?? '');
  const priceWindow = PriceWindow.of(order);
  const now = useClock(priceWindow?.expiresAt);
  const shown: PaymentState =
    priceWindow && priceWindow.isClosed(now) && canPay(order, payment) ? { kind: 'priceExpired' } : payment;
  const payable = canPay(order, shown);
  const short = payable && coverage?.kind === 'short' && !topUpPending;
  const symbol = tokenSymbol(order.paymentCryptoCurrency ?? '');
  const outcome = outcomeText(order);
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">{card}</ThemedText>
      <ThemedText>Price: {price}</ThemedText>
      {payable && priceWindow && <ThemedText type="small">Pay within {priceWindow.remaining(now)}</ThemedText>}
      <ThemedText type="small">{orderStatus(order, shown)}</ThemedText>
      {outcome && <ThemedText type="small">{outcome}</ThemedText>}
      {shown.kind === 'notSent' && shown.detail !== '' && <ThemedText type="small">{shown.detail}</ThemedText>}
      {shown.kind === 'failed' && shown.contactSupport && (
        <ThemedText type="small">This payment isn&apos;t on the network. Contact support about this order.</ThemedText>
      )}
      {short && <ThemedText type="small">{SavingsTopUp.notEnough(symbol)}</ThemedText>}
      {payable && <Button label={payLabel(price, coverage)} onPress={onPay} disabled={busy || short} />}
      {needsNewPrice(order, shown) && <Button label="Get new price" onPress={onNewPrice} disabled={busy} />}
      <Button label={payable ? 'Cancel' : 'Done'} onPress={onDone} disabled={busy} />
    </View>
  );
}

function useClock(until: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === undefined) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  return now;
}

function orderStatus(order: GiftCard, payment: PaymentState): string {
  if (order.status === 'expired') {
    return 'Order expired';
  }
  if (order.status !== 'unpaid') {
    return giftCardStatusLabel(order.status);
  }
  switch (payment.kind) {
    case 'movingSavings':
      return 'Moving from savings';
    case 'sending':
      return 'Sending payment';
    case 'confirming':
      return 'Payment sent, confirming';
    case 'failed':
      return 'Payment failed';
    case 'priceExpired':
      return 'Price expired';
    case 'notSent':
      return "Payment couldn't be sent";
    case 'ready':
      return giftCardStatusLabel(order.status);
  }
}

function denominationHint(merchant: Merchant): string {
  if (merchant.denominationType === 'fixed') {
    return `Choose an amount in ${merchant.currency}`;
  }
  const [min, max] = merchant.denominations;
  const range = `${min}–${max} ${merchant.currency}`;
  return merchant.denominationType === 'min-max-major' ? `${range}, whole amounts` : range;
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
