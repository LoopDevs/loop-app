import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Field } from '@/components/form';
import { GiftCardDetails } from '@/components/gift-card-details';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { ctx, type GiftCard, type Merchant } from '@/ctx/client';
import { network, type PaymentCurrency } from '@/stellar/network';
import type { SmartWallet } from '@/wallet/smart-wallet';

const pollIntervalMs = 3000;
const pollAttempts = 60;
const settledStatuses: GiftCard['status'][] = ['fulfilled', 'rejected', 'refunded', 'expired'];

type Props = {
  wallet: SmartWallet;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
  onPaid: () => void;
};

export function GiftCardPurchase({ wallet, busy, run, onPaid }: Props) {
  const [search, setSearch] = useState('');
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<PaymentCurrency>(network.tokens[0].currency);
  const [order, setOrder] = useState<GiftCard | null>(null);

  const findMerchants = useCallback(
    () =>
      run(async () => {
        setMerchants(await ctx.merchants(search));
      }),
    [run, search],
  );

  useEffect(() => {
    ctx.merchants('').then(setMerchants, () => setMerchants([]));
  }, []);

  const chooseMerchant = (chosen: Merchant) => {
    setMerchant(chosen);
    setOrder(null);
    setAmount(chosen.denominationType === 'fixed' ? chosen.denominations[0] : '');
  };

  const createOrder = () =>
    run(async () => {
      if (!merchant) {
        return;
      }
      setOrder(
        await ctx.orderGiftCard({
          merchantId: merchant.id,
          fiatAmount: amount.trim(),
          fiatCurrency: merchant.currency,
          cryptoCurrency: currency,
        }),
      );
    });

  const pay = () =>
    run(async () => {
      if (!order) {
        return;
      }
      const result = await wallet.pay(order);
      if (result.error) {
        throw new Error(`${result.status}: ${result.error}`);
      }
      onPaid();
      setOrder(await waitUntilSettled(order.id, setOrder));
    });

  const startOver = () => {
    setMerchant(null);
    setOrder(null);
    setAmount('');
  };

  if (order) {
    return <OrderView order={order} busy={busy} onPay={pay} onDone={startOver} />;
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
                onPress={() => setAmount(denomination)}
                selected={amount === denomination}
              />
            ))}
          </View>
        ) : (
          <Field
            value={amount}
            onChangeText={setAmount}
            placeholder={`Amount in ${merchant.currency}`}
            keyboardType="decimal-pad"
          />
        )}
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
  busy: boolean;
  onPay: () => void;
  onDone: () => void;
};

function OrderView({ order, busy, onPay, onDone }: OrderViewProps) {
  const card = `${order.cardFiatAmount} ${order.cardFiatCurrency} ${order.merchantName}`;
  const price = `${order.paymentCryptoAmount} ${order.paymentCryptoCurrency}`;
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">{card}</ThemedText>
      <ThemedText>Price: {price}</ThemedText>
      <ThemedText type="small">Status: {order.status}</ThemedText>
      {order.status === 'unpaid' && <Button label={`Pay ${price}`} onPress={onPay} disabled={busy} />}
      <GiftCardDetails giftCard={order} />
      <Button label={order.status === 'unpaid' ? 'Cancel' : 'Done'} onPress={onDone} disabled={busy} />
    </View>
  );
}

function denominationHint(merchant: Merchant): string {
  if (merchant.denominationType === 'fixed') {
    return `Choose an amount in ${merchant.currency}`;
  }
  const [min, max] = merchant.denominations;
  return `${min}–${max} ${merchant.currency}`;
}

async function waitUntilSettled(id: string, onUpdate: (giftCard: GiftCard) => void): Promise<GiftCard> {
  let giftCard = await ctx.giftCard(id);
  for (let attempt = 0; attempt < pollAttempts && !settledStatuses.includes(giftCard.status); attempt++) {
    onUpdate(giftCard);
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    giftCard = await ctx.giftCard(id);
  }
  return giftCard;
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
