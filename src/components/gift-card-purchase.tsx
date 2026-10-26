import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Field } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { amountErrorMessage } from '@/ctx/amount-error';
import { ctx, CtxError, type GiftCard, type Merchant } from '@/ctx/client';
import {
  giftCardStatusLabel,
  historyHiddenStatuses,
  pollIntervalMs,
  settledStatuses,
} from '@/ctx/gift-card-status';
import {
  canPay,
  needsNewPrice,
  resumedPaymentState,
  sendFailureState,
  type PaymentState,
} from '@/ctx/payment-state';
import { dates, money } from '@/money';
import { network, type PaymentCurrency } from '@/stellar/network';
import { soroban } from '@/stellar/soroban';
import type { SmartWallet } from '@/wallet/smart-wallet';

type Props = {
  wallet: SmartWallet;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
  onPaid: () => void;
};

export function GiftCardPurchase({ wallet, busy, run, onPaid }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<PaymentCurrency>(network.tokens[0].currency);
  const [order, setOrder] = useState<GiftCard | null>(null);
  const [payment, setPayment] = useState<PaymentState>({ kind: 'ready' });

  const findMerchants = useCallback(
    () =>
      run(async () => {
        setMerchants(await ctx.merchants(search));
      }),
    [run, search],
  );

  const following = useRef(0);
  const paying = useRef(false);

  const stopFollowing = () => {
    following.current += 1;
  };

  const followOrder = useCallback(async (giftCard: GiftCard, txId?: string) => {
    const generation = ++following.current;
    const isCurrent = () => following.current === generation;
    let current = giftCard;
    while (isCurrent() && !settledStatuses.includes(current.status)) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      try {
        if (current.status === 'unpaid' && txId && (await soroban.transactionStatus(txId)) === 'failed') {
          if (isCurrent()) {
            setPayment({ kind: 'failed' });
          }
          return;
        }
        current = await ctx.giftCard(current.id);
      } catch {
        continue;
      }
      if (isCurrent()) {
        const { status } = current;
        setOrder((held) => held && { ...held, status });
      }
    }
  }, []);

  const resumeOrder = useCallback(
    () =>
      run(async () => {
        const giftCard = await ctx.activeGiftCard();
        if (!giftCard) {
          return;
        }
        const resumed = resumedPaymentState(giftCard);
        setOrder(giftCard);
        setPayment(resumed);
        if (resumed.kind === 'confirming' || giftCard.status === 'paid') {
          void followOrder(giftCard, resumed.kind === 'confirming' ? resumed.txId : undefined);
        }
      }),
    [run, followOrder],
  );

  useEffect(() => {
    ctx.merchants('').then(setMerchants, () => setMerchants([]));
    resumeOrder();
    return () => {
      following.current += 1;
    };
  }, [resumeOrder]);

  const chooseMerchant = (chosen: Merchant) => {
    setMerchant(chosen);
    setOrder(null);
    changeAmount(chosen.denominationType === 'fixed' ? chosen.denominations[0] : '');
  };

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
      if (!merchant) {
        return;
      }
      try {
        showNewOrder(
          await ctx.orderGiftCard({
            merchantId: merchant.id,
            fiatAmount: amount.trim(),
            fiatCurrency: merchant.currency,
            cryptoCurrency: currency,
          }),
        );
      } catch (error) {
        const message = error instanceof CtxError ? amountErrorMessage(error.errorName(), merchant) : null;
        if (!message) {
          throw error;
        }
        setAmountError(message);
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
    let sent = false;
    try {
      const result = await wallet.pay(giftCard, () => {
        sent = true;
      });
      return result.error ? { kind: 'failed' } : { kind: 'confirming', txId: result.hash };
    } catch (error) {
      const rejection =
        error instanceof CtxError
          ? {
              status: error.status,
              errorName: error.errorName(),
              message: error.bodyField('message'),
              txId: error.bodyField('txId'),
            }
          : undefined;
      const state = sendFailureState(sent, rejection);
      if (state) {
        return state;
      }
      setPayment({ kind: 'ready' });
      throw error;
    }
  };

  const pay = async () => {
    if (paying.current || !order || !canPay(order, payment)) {
      return;
    }
    paying.current = true;
    try {
      await run(async () => {
        setPayment({ kind: 'sending' });
        const next = await sendPayment(order);
        setPayment(next);
        if (next.kind === 'confirming') {
          onPaid();
          void followOrder(order, next.txId);
        }
      });
    } finally {
      paying.current = false;
    }
  };

  const startOver = () => {
    stopFollowing();
    setMerchant(null);
    setOrder(null);
    setPayment({ kind: 'ready' });
    changeAmount('');
  };

  const finish = () => {
    if (order && !historyHiddenStatuses.includes(order.status)) {
      router.push(`/orders/${order.id}`, { withAnchor: true });
    }
    startOver();
  };

  if (order) {
    return (
      <OrderView
        order={order}
        payment={payment}
        busy={busy}
        onPay={pay}
        onNewPrice={getNewPrice}
        onDone={finish}
      />
    );
  }

  if (merchant) {
    return (
      <View style={styles.section}>
        <ThemedText type="smallBold">{merchant.name}</ThemedText>
        <ThemedText type="small">{denominationHint(merchant)}</ThemedText>
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
              label={token.symbol}
              onPress={() => setCurrency(token.currency)}
              selected={currency === token.currency}
            />
          ))}
        </View>
        <Button label="Get price" onPress={createOrder} disabled={busy || !amount.trim()} />
        <Button label="Back" onPress={startOver} disabled={busy} />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">Buy a gift card</ThemedText>
      <Field
        value={search}
        onChangeText={setSearch}
        placeholder="Search merchants"
        onSubmitEditing={findMerchants}
        returnKeyType="search"
      />
      {merchants.map((candidate) => (
        <Button
          key={candidate.id}
          label={`${candidate.name} · ${candidate.currency} · ${candidate.userDiscount / 100}% cashback`}
          onPress={() => chooseMerchant(candidate)}
          disabled={busy}
        />
      ))}
    </View>
  );
}

type OrderViewProps = {
  order: GiftCard;
  payment: PaymentState;
  busy: boolean;
  onPay: () => void;
  onNewPrice: () => void;
  onDone: () => void;
};

function OrderView({ order, payment, busy, onPay, onNewPrice, onDone }: OrderViewProps) {
  const card = `${money.ctx(order.cardFiatAmount, order.cardFiatCurrency)} ${order.merchantName}`;
  const price = money.payment(order.paymentCryptoAmount ?? '', order.paymentCryptoCurrency ?? '');
  const payable = canPay(order, payment);
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">{card}</ThemedText>
      <ThemedText>Price: {price}</ThemedText>
      {payable && order.paymentUrlExpiration && (
        <ThemedText type="small">Price held until {dates.time(order.paymentUrlExpiration)}</ThemedText>
      )}
      <ThemedText type="small">{orderStatus(order, payment)}</ThemedText>
      {payment.kind === 'notSent' && payment.detail !== '' && <ThemedText type="small">{payment.detail}</ThemedText>}
      {payable && <Button label={`Pay ${price}`} onPress={onPay} disabled={busy} />}
      {needsNewPrice(order, payment) && <Button label="Get new price" onPress={onNewPrice} disabled={busy} />}
      <Button label={payable ? 'Cancel' : 'Done'} onPress={onDone} disabled={busy} />
    </View>
  );
}

function orderStatus(order: GiftCard, payment: PaymentState): string {
  if (order.status === 'expired') {
    return 'Order expired';
  }
  if (order.status !== 'unpaid') {
    return giftCardStatusLabel(order.status);
  }
  switch (payment.kind) {
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
