import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePreventRemove, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { dismissBrowser, openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';

import { Button, Field, Notice } from '@/components/form';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { FontFamily, Motion, Radius, Spacing } from '@/constants/theme';
import { amountErrorMessage } from '@/ctx/amount-error';
import { normalizeAmount } from '@/ctx/amount-input';
import { BankPayment } from '@/ctx/bank-payment';
import { BuyPrice, type BuyQuote } from '@/ctx/buy-price';
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
import { OneTapBuy, type BuyResult, type BuySteps, type SentRecord, type ShownOrder } from '@/ctx/one-tap-buy';
import { paymentLock } from '@/ctx/payment-lock';
import { PaymentSender, type SendOutcome } from '@/ctx/payment-sender';
import {
  canPay,
  landingClosed,
  sentTransactionOutcome,
  type PaymentState,
  type PayRejection,
  type SignedTransfer,
} from '@/ctx/payment-state';
import { SentPayments } from '@/ctx/sent-payments';
import { PriceWindow } from '@/ctx/price-window';
import { Profile } from '@/ctx/profile';
import { Rates } from '@/ctx/rates';
import { errorMessage, useBusyAction } from '@/hooks/use-busy-action';
import { useHoldings } from '@/hooks/use-holdings';
import { useTheme } from '@/hooks/use-theme';
import { money } from '@/money';
import { haptics } from '@/native/haptics';
import { network, offeredTokens, onlyPaymentCurrency, type PaymentCurrency, type Token } from '@/stellar/network';
import { soroban } from '@/stellar/soroban';
import { units } from '@/stellar/units';
import { holdCriticalReload } from '@/updates/update-checker';
import type { Coverage, Holdings } from '@/wallet/holdings';
import { SavingsTopUp, type PendingWithdrawal, type TopUpOutcome } from '@/wallet/savings-top-up';
import type { SmartWallet } from '@/wallet/smart-wallet';

type Props = {
  merchant: Merchant;
  wallet: SmartWallet;
  profile: Profile;
  onProfile: (profile: Profile) => void;
};

type PayWith = PaymentCurrency | typeof BankPayment.option;

type SentTransaction = {
  txId?: string;
  expiryLedger?: number;
};

const notEnoughMessage = 'Not enough in your balance';

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
  if (await wallet.paymentLanded(token, await signedTransfer(giftCard), expiryLedger)) {
    return null;
  }
  return { kind: 'failed', contactSupport: true };
}

async function signedTransfer(giftCard: GiftCard): Promise<SignedTransfer | null> {
  const recorded = await sentPayments.get(giftCard.paymentId);
  if (recorded?.transfer) {
    return recorded.transfer;
  }
  const price = orderPrice(giftCard);
  return price === null ? null : { amount: price };
}

function needsSupport(state: PaymentState): boolean {
  return state.kind === 'failed' && state.contactSupport === true;
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
const paymentSender = new PaymentSender(sentPayments, payRejection, paymentLock);
const pendingTopUps = new Map<string, PendingWithdrawal>();
const inFlightPayments = new InFlightPayments();
const oneTapBuy = new OneTapBuy();
const noRates = new Rates(new Map());

export function GiftCardPurchase({ merchant, wallet, profile, onProfile }: Props) {
  const router = useRouter();
  const { busy, message, setMessage, run } = useBusyAction();
  const [amount, setAmount] = useState(firstAmount(merchant));
  const [amountError, setAmountError] = useState<string | null>(null);
  const [legalName, setLegalName] = useState('');
  const [chosen, setChosen] = useState<PayWith | null>(null);
  const [refusedCurrencies, setRefusedCurrencies] = useState<ReadonlySet<PaymentCurrency>>(new Set());
  const [draftAmount, setDraftAmount] = useState<string | null>(null);
  const [order, setOrder] = useState<GiftCard | null>(null);
  const [payment, setPayment] = useState<PaymentState>({ kind: 'ready' });
  const [confirmPrice, setConfirmPrice] = useState<bigint | null>(null);
  const [spent, setSpent] = useState(0n);
  const [cardRates, setCardRates] = useState<Rates | null>(null);
  const { view, refresh } = useHoldings(wallet);
  const toast = useToast();

  const currencies = offeredTokens.map((token) => token.currency);
  const stable = view?.stable ?? Rates.usd;
  const bankOffered = BankPayment.offered(merchant.currency, profile);
  const chosenCurrency = chosen === BankPayment.option ? null : chosen;
  const currency =
    onlyPaymentCurrency ??
    chosenCurrency ??
    view?.holdings.preferredCurrency(currencies, stable, refusedCurrencies) ??
    null;
  const payWith: PayWith | null = chosen ?? (bankOffered ? BankPayment.option : currency);
  const byBank = payWith === BankPayment.option;
  const bankOrder = order ? BankPayment.isBank(order) : byBank;
  const legalNameNeeded = byBank && !profile.hasBankIdentity();
  const legalNameProblem = legalNameNeeded ? Profile.legalNameProblem(legalName) : null;
  const usdPrice = currency ? (view?.holdings.rates ?? noRates).usdPrice(currency) : null;
  const fiatAmount = normalizeAmount(amount);
  const amountProblem = merchant.amountProblem(amount);
  const shownPrice = fiatAmount
    ? BuyPrice.shown(fiatAmount, (cardRates ?? noRates).usdPrice(merchant.currency))
    : null;
  const balance = view && currency ? view.holdings.spendable(currency) : null;
  const shownBalance = balance === null ? null : balance > spent ? balance - spent : 0n;

  const following = useRef(0);
  const mounted = useRef(true);
  const live = useRef({ wallet, refresh });
  const heldOrder = useRef<GiftCard | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    live.current = { wallet, refresh };
  }, [wallet, refresh]);

  useEffect(() => {
    heldOrder.current = order;
  }, [order]);

  useEffect(() => {
    refresh().catch((error: unknown) => setMessage(errorMessage(error)));
  }, [refresh, setMessage]);

  useEffect(() => {
    let current = true;
    void Rates.fetch([merchant.currency]).then((rates) => {
      if (current) {
        setCardRates(rates);
      }
    });
    return () => {
      current = false;
    };
  }, [merchant.currency]);

  usePreventRemove(payment.kind === 'sending' || payment.kind === 'movingSavings', () =>
    toast('Wait until the payment is sent'),
  );

  const stopFollowing = () => {
    following.current += 1;
  };

  const followOrder = useCallback(async (giftCard: GiftCard, sent: SentRecord | null) => {
    const generation = ++following.current;
    const isCurrent = () => following.current === generation;
    let current = giftCard;
    let checkingChain = sent !== null;
    let landed = false;
    while (isCurrent()) {
      if (BankPayment.linkExpired(current, Date.now())) {
        setPayment({ kind: 'bankExpired' });
        return;
      }
      if (sent && checkingChain && OneTapBuy.checksChain(current)) {
        const failure = await sentPaymentFailure(current, live.current.wallet, {
          txId: sent.txId ?? current.paymentCryptoTxId,
          expiryLedger: sent.expiryLedger,
        }).catch(() => null);
        if (!isCurrent()) {
          return;
        }
        if (failure) {
          setPayment(failure);
          if (!needsSupport(failure)) {
            setSpent(0n);
            return;
          }
          checkingChain = false;
        }
      }
      if (settledStatuses.includes(current.status)) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      try {
        current = await ctx.giftCard(current.id);
      } catch {
        continue;
      }
      if (!isCurrent()) {
        return;
      }
      const fetched = current;
      setOrder((held) => OneTapBuy.merged(held, fetched));
      if (!landed && current.paymentStatus === 'paid') {
        landed = true;
        if (BankPayment.isBank(current)) {
          void dismissBrowser();
        }
        live.current
          .refresh()
          .then(() => {
            if (isCurrent()) {
              setSpent(0n);
            }
          })
          .catch(() => undefined);
      }
    }
  }, []);

  const show = useCallback(
    (shown: ShownOrder | null) => {
      setDraftAmount(null);
      setSpent(0n);
      setConfirmPrice(null);
      setOrder(shown?.order ?? null);
      setPayment(shown?.payment ?? { kind: 'ready' });
      if (shown?.follow) {
        void followOrder(shown.order, shown.sent);
      }
    },
    [followOrder],
  );

  const resumeOrder = useCallback(
    () =>
      run(async () => {
        const held = heldOrder.current;
        let giftCard = held ? await ctx.giftCard(held.id) : await ctx.activeGiftCard(merchant.id);
        while (giftCard && inFlightPayments.has(giftCard.paymentId)) {
          show({ order: giftCard, payment: { kind: 'sending' }, follow: false, sent: null });
          await inFlightPayments.settled(giftCard.paymentId);
          if (!mounted.current) {
            return;
          }
          giftCard = await ctx.giftCard(giftCard.id);
        }
        if (giftCard && BankPayment.isBank(giftCard)) {
          show(BankPayment.resumed(giftCard, Date.now()));
          return;
        }
        const sent = giftCard ? await sentPayments.get(giftCard.paymentId) : null;
        show(OneTapBuy.resumed(giftCard, sent));
      }),
    [run, show, merchant.id],
  );

  useEffect(() => {
    if (!oneTapBuy.busy) {
      resumeOrder();
    }
    return () => {
      following.current += 1;
    };
  }, [resumeOrder, wallet.address]);

  const changeAmount = (next: string) => {
    setAmount(next);
    setAmountError(null);
    setMessage('');
  };

  const rollBack = () => {
    stopFollowing();
    setDraftAmount(null);
    setOrder(null);
    setConfirmPrice(null);
    setPayment({ kind: 'ready' });
    setSpent(0n);
  };

  const topUpFromSavings = async (giftCard: GiftCard, price: bigint): Promise<PaymentState | null> => {
    setPayment({ kind: 'movingSavings' });
    let outcome: TopUpOutcome;
    try {
      outcome = await wallet
        .savingsTopUp()
        .run(price, PriceWindow.of(giftCard), pendingTopUps.get(wallet.address));
    } finally {
      refresh().catch((error: unknown) => setMessage(errorMessage(error)));
    }
    if (outcome.kind === 'stillMoving') {
      pendingTopUps.set(wallet.address, outcome.withdrawal);
    } else {
      pendingTopUps.delete(wallet.address);
    }
    switch (outcome.kind) {
      case 'covered':
        return null;
      case 'priceClosing':
      case 'priceExpired':
        return { kind: 'priceExpired' };
      default:
        return { kind: 'notSent', detail: topUpProblem(outcome) };
    }
  };

  const payOrder = async (giftCard: GiftCard, holdings: Holdings | null): Promise<SendOutcome> => {
    const coverage = orderCoverage(giftCard, holdings);
    const toppingUp = coverage?.kind === 'savings' || hasPendingTopUp(giftCard, wallet);
    if (coverage?.kind === 'short' && !toppingUp) {
      return { state: { kind: 'notSent', detail: notEnoughMessage }, resumed: false };
    }
    const topUpPrice = toppingUp ? orderPrice(giftCard) : null;
    const task = inFlightPayments.start(giftCard.paymentId, () =>
      holdCriticalReload(async (): Promise<SendOutcome> => {
        const recorded = await paymentSender.recorded(giftCard.paymentId);
        if (recorded) {
          return { state: recorded, resumed: true };
        }
        if (topUpPrice !== null) {
          const stopped = await topUpFromSavings(giftCard, topUpPrice);
          if (stopped) {
            return { state: stopped, resumed: false };
          }
        }
        setPayment({ kind: 'sending' });
        return paymentSender.send(giftCard.paymentId, () => wallet.pay(giftCard));
      }),
    );
    if (!task) {
      throw new Error('This payment is already on its way');
    }
    return task;
  };

  const buySteps = (cardAmount: string, payWith: PaymentCurrency): BuySteps => {
    const holdings = view?.holdings ?? null;
    return {
      createOrder: async () => {
        const created = await ctx.orderGiftCard({
          merchantId: merchant.id,
          fiatAmount: cardAmount,
          fiatCurrency: merchant.currency,
          cryptoCurrency: payWith,
        });
        setOrder(created);
        return created;
      },
      paymentStarted: async (giftCard) => {
        if (inFlightPayments.has(giftCard.paymentId)) {
          return giftCard;
        }
        const sentHere = (await paymentSender.recorded(giftCard.paymentId)) !== null;
        const fetched = await ctx.giftCard(giftCard.id);
        return OneTapBuy.paymentStarted(fetched, sentHere) ? fetched : null;
      },
      pay: (giftCard) => payOrder(giftCard, holdings),
      now: () => Date.now(),
    };
  };

  const showResult = async (result: BuyResult) => {
    const sent = result.kind === 'alreadyPaying' ? await sentPayments.get(result.order.paymentId) : null;
    const view = OneTapBuy.view(result, sent);
    switch (view.kind) {
      case 'rollBack':
        rollBack();
        haptics.error();
        setMessage(view.message);
        return;
      case 'confirm':
        setOrder(view.order);
        setConfirmPrice(view.price);
        setPayment({ kind: 'ready' });
        setSpent(0n);
        return;
      case 'show': {
        const { order: shownOrder, payment: shownPayment, follow, sent: shownSent } = view.shown;
        setOrder(shownOrder);
        setPayment(shownPayment);
        if (view.celebrate) {
          haptics.success();
        }
        if (follow && mounted.current) {
          void followOrder(shownOrder, shownSent);
        }
      }
    }
  };

  const settle = (payWith: PaymentCurrency, task: () => Promise<BuyResult>) =>
    run(async () => {
      let result: BuyResult;
      try {
        result = await task();
      } catch (error) {
        rollBack();
        haptics.error();
        const name = error instanceof CtxError ? error.errorName() : undefined;
        const amountMessage = amountErrorMessage(name, merchant);
        if (amountMessage) {
          setAmountError(amountMessage);
          return;
        }
        const refusal = onlyPaymentCurrency ? null : currencyRefusalMessage(name, tokenSymbol(payWith));
        if (refusal && refusesCurrency(name)) {
          setRefusedCurrencies((refused) => new Set([...refused, payWith]));
          setChosen(null);
        }
        setMessage(refusal ?? OneTapBuy.notBoughtMessage);
        return;
      }
      await showResult(result);
    });

  const approveAtBank = async (giftCard: GiftCard) => {
    const link = BankPayment.openLink(giftCard);
    if (!link) {
      return;
    }
    await openBrowserAsync(link, { presentationStyle: WebBrowserPresentationStyle.AUTOMATIC });
    const fetched = await ctx.giftCard(giftCard.id).catch(() => null);
    if (fetched && mounted.current) {
      setOrder((held) => OneTapBuy.merged(held, fetched));
    }
  };

  const createBankOrder = async (cardAmount: string): Promise<GiftCard | null> => {
    try {
      const identity = legalNameNeeded ? profile.legalNameUpdate(legalName) : null;
      if (identity) {
        onProfile(profile.withUser(await ctx.updateUser(identity)));
      }
      return await ctx.orderGiftCard({
        merchantId: merchant.id,
        fiatAmount: cardAmount,
        fiatCurrency: merchant.currency,
      });
    } catch (error) {
      rollBack();
      haptics.error();
      const name = error instanceof CtxError ? error.errorName() : undefined;
      const amountMessage = amountErrorMessage(name, merchant);
      if (amountMessage) {
        setAmountError(amountMessage);
        return null;
      }
      setMessage(BankPayment.refusalMessage(name) ?? OneTapBuy.notBoughtMessage);
      return null;
    }
  };

  const buyByBank = (cardAmount: string) =>
    run(async () => {
      stopFollowing();
      setMessage('');
      setAmountError(null);
      setConfirmPrice(null);
      setOrder(null);
      setDraftAmount(cardAmount);
      setPayment({ kind: 'sending' });
      setSpent(0n);
      const created = await createBankOrder(cardAmount);
      if (!created || !mounted.current) {
        return;
      }
      setOrder(created);
      setPayment({ kind: 'bank' });
      haptics.tap();
      void followOrder(created, null);
      if (process.env.EXPO_OS !== 'web') {
        void approveAtBank(created);
      }
    });

  const short = !byBank && shownPrice !== null && balance !== null && shownPrice > balance;
  const walletReady = currency !== null && view !== null && cardRates !== null && !short;
  const canBuy =
    !busy &&
    !oneTapBuy.busy &&
    fiatAmount !== null &&
    amountProblem === null &&
    (byBank ? legalNameProblem === null : walletReady);

  const buy = () => {
    if (!canBuy || !fiatAmount) {
      return;
    }
    if (byBank) {
      void buyByBank(fiatAmount);
      return;
    }
    if (!currency) {
      return;
    }
    const quote: BuyQuote = { shown: shownPrice, currency, usdPrice };
    stopFollowing();
    setMessage('');
    setAmountError(null);
    setConfirmPrice(null);
    setOrder(null);
    setDraftAmount(fiatAmount);
    setPayment({ kind: 'sending' });
    setSpent(shownPrice ?? 0n);
    void settle(currency, () => oneTapBuy.start(buySteps(fiatAmount, currency), quote));
  };

  const payConfirmedPrice = () => {
    if (!order || confirmPrice === null || !currency || !canPay(order, payment)) {
      return;
    }
    const quote: BuyQuote = { shown: confirmPrice, currency, usdPrice };
    setConfirmPrice(null);
    setPayment({ kind: 'sending' });
    setSpent(confirmPrice);
    void settle(currency, () => oneTapBuy.confirm(buySteps(order.cardFiatAmount, currency), order, quote));
  };

  const startOver = () => {
    rollBack();
    setMessage('');
    refresh().catch((error: unknown) => setMessage(errorMessage(error)));
  };

  const tryAgain = () => {
    rollBack();
    buy();
  };

  const finish = () => {
    if (order && !isHiddenFromHistory(order)) {
      router.push(`/wallet/${order.id}`, { withAnchor: true });
    }
    startOver();
  };

  const balanceText = shownBalance === null || !currency ? null : money.token(shownBalance, currency);

  if (order || draftAmount) {
    return (
      <View style={styles.section}>
        <OrderView
          merchant={merchant}
          cardAmount={order?.cardFiatAmount ?? draftAmount ?? ''}
          order={order}
          payment={payment}
          confirmPrice={confirmPrice}
          balance={bankOrder ? null : balanceText}
          busy={busy}
          onConfirm={payConfirmedPrice}
          onApprove={approveAtBank}
          onRetry={tryAgain}
          onDone={finish}
        />
        {message !== '' && <Notice message={message} />}
      </View>
    );
  }

  const estimate = merchant.cashbackEstimate(fiatAmount ?? '');
  const range = merchant.rangeLabel();
  const cardLabel = fiatAmount ? merchant.shortAmount(fiatAmount) : null;
  const bankPrice = fiatAmount ? money.fiat(fiatAmount, merchant.currency) : null;
  const walletOptions = onlyPaymentCurrency
    ? offeredTokens.filter((token) => token.currency === onlyPaymentCurrency)
    : offeredTokens;
  const payOptions = (
    <View style={styles.step}>
      <ThemedText type="heading" accessibilityRole="header">
        Pay with
      </ThemedText>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {bankOffered && (
          <View style={styles.token}>
            <Button
              label="UK bank account"
              onPress={() => setChosen(BankPayment.option)}
              selected={byBank}
            />
          </View>
        )}
        {walletOptions.map((token) => (
          <View key={token.currency} style={styles.token}>
            <Button
              label={tokenLabel(token, view?.holdings ?? null)}
              onPress={() => setChosen(token.currency)}
              selected={!byBank && currency === token.currency}
              disabled={refusedCurrencies.has(token.currency) || view?.holdings.spendable(token.currency) === 0n}
            />
          </View>
        ))}
      </View>
      {byBank && (
        <ThemedText type="small" themeColor="textSecondary">
          You approve the payment in your banking app. Cashback is paid in pounds.
        </ThemedText>
      )}
    </View>
  );
  return (
    <PurchaseCard>
      <View style={styles.step}>
        <ThemedText type="heading" accessibilityRole="header">
          Choose an amount
        </ThemedText>
        {merchant.denominationType === 'fixed' ? (
          <View style={styles.grid} accessibilityRole="radiogroup">
            {merchant.denominationValues.map((denomination) => (
              <View key={denomination} style={styles.chip}>
                <Button
                  label={merchant.shortAmount(denomination)}
                  onPress={() => changeAmount(denomination)}
                  selected={amount === denomination}
                />
              </View>
            ))}
          </View>
        ) : (
          <>
            <AmountEntry merchant={merchant} value={amount} onChange={changeAmount} />
            {range && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
                {range}
              </ThemedText>
            )}
            <View style={styles.grid} accessibilityRole="radiogroup">
              {merchant.quickAmounts().map((quick) => (
                <View key={quick} style={styles.chip}>
                  <Button
                    label={merchant.shortAmount(quick)}
                    onPress={() => changeAmount(quick)}
                    selected={fiatAmount !== null && units.parseTruncated(fiatAmount) === units.parseTruncated(quick)}
                  />
                </View>
              ))}
            </View>
          </>
        )}
        {(amountProblem ?? amountError) && <InlineError text={(amountProblem ?? amountError) as string} />}
      </View>

      {(onlyPaymentCurrency === null || bankOffered) && payOptions}

      {legalNameNeeded && (
        <View style={styles.step}>
          <ThemedText type="heading" accessibilityRole="header">
            Name on your bank account
          </ThemedText>
          <Field
            value={legalName}
            onChangeText={setLegalName}
            placeholder="First and last name"
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
          />
          <ThemedText type="small" themeColor="textSecondary">
            Your bank checks this name when you approve the payment.
          </ThemedText>
        </View>
      )}

      <View style={styles.summary}>
        {byBank
          ? bankPrice && <SummaryRow label="You pay" value={bankPrice} />
          : shownPrice !== null && <SummaryRow label="You pay" value={dollars(shownPrice)} />}
        {estimate && <SummaryRow label="Cashback" value={`About ${estimate}`} emphasis />}
        {!byBank && balanceText && <SummaryRow label="Your balance" value={balanceText} />}
      </View>
      {short && <InlineError text={notEnoughMessage} />}
      <Button
        label={cardLabel ? `Buy ${cardLabel} gift card` : 'Buy gift card'}
        variant="primary"
        onPress={buy}
        disabled={!canBuy}
      />
      {message !== '' && <Notice message={message} actionLabel="Try again" onAction={buy} disabled={!canBuy} />}
    </PurchaseCard>
  );
}

function AmountEntry({
  merchant,
  value,
  onChange,
}: {
  merchant: Merchant;
  value: string;
  onChange: (next: string) => void;
}) {
  const theme = useTheme();
  const wholeUnits = merchant.denominationType === 'min-max-major';
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={merchant.shortAmount('0')}
      accessibilityLabel={`Amount in ${merchant.currency}`}
      keyboardType={wholeUnits ? 'number-pad' : 'decimal-pad'}
      inputMode={wholeUnits ? 'numeric' : 'decimal'}
      placeholderTextColor={theme.textSecondary}
      selectionColor={theme.accent}
      style={[styles.amountEntry, { color: theme.text, borderColor: theme.borderStrong }]}
    />
  );
}

function PurchaseCard({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(Motion.state).easing(Motion.easeOut)}
      style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      {children}
    </Animated.View>
  );
}

function SummaryRow({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.summaryLabel}>
        {label}
      </ThemedText>
      <ThemedText type={emphasis ? 'smallBold' : 'small'} themeColor={emphasis ? 'success' : 'text'} style={styles.summaryValue}>
        {value}
      </ThemedText>
    </View>
  );
}

function InlineError({ text }: { text: string }) {
  return (
    <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite">
      {text}
    </ThemedText>
  );
}

function firstAmount(merchant: Merchant): string {
  return merchant.denominationType === 'fixed' ? (merchant.denominationValues[0] ?? '') : '';
}

function dollars(price: bigint): string {
  return money.fiat(BuyPrice.dollars(price), Rates.usd);
}

function tokenSymbol(currency: string): string {
  return network.tokens.find((token) => token.currency === currency)?.symbol ?? currency;
}

function tokenLabel(token: Token, holdings: Holdings | null): string {
  const name = Profile.currencyLabel(token.currency);
  return holdings ? `${name} ${money.token(holdings.spendable(token.currency), token.currency)}` : name;
}

function topUpProblem(outcome: TopUpOutcome): string {
  switch (outcome.kind) {
    case 'withdrawFailed':
      return "Couldn't move money from your savings. Try again.";
    case 'stillMoving':
      return 'Still moving money from your savings. Try again in a moment.';
    default:
      return notEnoughMessage;
  }
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

type OrderViewProps = {
  merchant: Merchant;
  cardAmount: string;
  order: GiftCard | null;
  payment: PaymentState;
  confirmPrice: bigint | null;
  balance: string | null;
  busy: boolean;
  onConfirm: () => void;
  onApprove: (order: GiftCard) => void;
  onRetry: () => void;
  onDone: () => void;
};

const bankLinkExpiredMessage = 'The payment link expired before the payment was approved.';

function OrderView({
  merchant,
  cardAmount,
  order,
  payment,
  confirmPrice,
  balance,
  busy,
  onConfirm,
  onApprove,
  onRetry,
  onDone,
}: OrderViewProps) {
  const theme = useTheme();
  const sentUnconfirmed = payment.kind === 'confirming' || needsSupport(payment);
  const outcome = order ? outcomeText(order, sentUnconfirmed) : null;
  const ready = order?.status === 'fulfilled';
  const submitted = order?.status === 'paid' || payment.kind === 'confirming';
  const working = payment.kind === 'sending' || payment.kind === 'movingSavings';
  const bankLink = order && payment.kind === 'bank' ? BankPayment.openLink(order) : null;
  const bankLinkExpired = order?.status === 'unpaid' && payment.kind === 'bankExpired';
  const paymentFailed = order?.status === 'unpaid' && payment.kind === 'failed';
  const failed = paymentFailed || bankLinkExpired || outcome !== null;
  const canRetry = paymentFailed && !needsSupport(payment);
  const headline = submitted
    ? 'Your gift card is on its way'
    : bankLink
      ? 'Approve the payment in your banking app'
      : 'Buying your gift card…';
  return (
    <PurchaseCard>
      <View style={styles.orderHead}>
        <ThemedText type="small" themeColor="textSecondary">
          {merchant.name} gift card
        </ThemedText>
        <ThemedText type="subtitle">{merchant.shortAmount(cardAmount)}</ThemedText>
        {!ready && !failed && confirmPrice === null && <ThemedText type="smallBold">{headline}</ThemedText>}
      </View>

      {balance && (
        <View style={[styles.summary, { borderColor: theme.border }]}>
          <SummaryRow label="Your balance" value={balance} />
        </View>
      )}

      {confirmPrice !== null ? (
        <Notice
          tone="neutral"
          message={`The price for this card is now ${dollars(confirmPrice)}. Buy it at this price?`}
        />
      ) : ready ? (
        <View style={styles.outcome} accessibilityLiveRegion="polite">
          <SymbolView
            name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }}
            size={28}
            tintColor={theme.success}
          />
          <View style={styles.outcomeText}>
            <ThemedText type="smallBold">Your gift card is ready</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Open it to see the code and how to use it.
            </ThemedText>
          </View>
        </View>
      ) : (
        <PaymentProgress step={progressStep(order, payment)} label={progressLabel(order, payment)} failed={failed} />
      )}

      {outcome && <Notice message={outcome} />}
      {order?.status === 'unpaid' && needsSupport(payment) && (
        <Notice message="We couldn't find this payment. Contact support about this order." />
      )}
      {canRetry && (
        <Notice
          message="Your payment didn't go through, and you weren't charged."
          actionLabel="Try again"
          onAction={onRetry}
          disabled={busy}
        />
      )}
      {bankLinkExpired && (
        <Notice message={bankLinkExpiredMessage} actionLabel="Try again" onAction={onRetry} disabled={busy} />
      )}

      {confirmPrice !== null && (
        <Button label={`Buy for ${dollars(confirmPrice)}`} variant="primary" onPress={onConfirm} disabled={busy} />
      )}
      {bankLink && order && (
        <Button label="Approve at your bank" variant="primary" onPress={() => onApprove(order)} disabled={busy} />
      )}
      {!working && (
        <Button
          label={ready ? 'View gift card' : confirmPrice !== null ? 'Cancel' : 'Done'}
          variant={ready ? 'primary' : 'quiet'}
          onPress={onDone}
          disabled={busy}
        />
      )}
    </PurchaseCard>
  );
}

const progressLabels = ['Paying', 'On its way', 'Ready'];

function progressStep(order: GiftCard | null, payment: PaymentState): number {
  if (order?.status === 'fulfilled') {
    return 2;
  }
  if (order?.status === 'paid' || payment.kind === 'confirming') {
    return 1;
  }
  return 0;
}

function PaymentProgress({ step, label, failed }: { step: number; label: string; failed: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.progress} accessibilityLiveRegion="polite" accessibilityLabel={label}>
      <View style={styles.progressBars}>
        {progressLabels.map((stepLabel, index) => (
          <View key={stepLabel} style={styles.progressStep}>
            {index === step && !failed ? (
              <Skeleton width="100%" height={styles.progressBar.height} color={theme.accent} />
            ) : (
              <View
                style={[
                  styles.progressBar,
                  {
                    backgroundColor:
                      index < step ? theme.accent : index === step ? theme.danger : theme.backgroundSelected,
                  },
                ]}
              />
            )}
            <ThemedText type="caption" themeColor={index <= step ? 'text' : 'textSecondary'}>
              {stepLabel}
            </ThemedText>
          </View>
        ))}
      </View>
      <View style={styles.statusRow}>
        <ThemedText type="smallBold" themeColor={failed ? 'danger' : 'text'}>
          {label}
        </ThemedText>
      </View>
    </View>
  );
}

function progressLabel(order: GiftCard | null, payment: PaymentState): string {
  if (order && order.status !== 'unpaid') {
    return giftCardStatusLabel(order.status);
  }
  switch (payment.kind) {
    case 'movingSavings':
      return 'Moving money from your savings';
    case 'bank':
      return 'Waiting for your bank';
    case 'ready':
    case 'sending':
      return 'Paying';
    case 'confirming':
      return 'Payment sent, confirming';
    case 'bankExpired':
    case 'failed':
    case 'priceExpired':
    case 'notSent':
      return "Payment didn't go through";
  }
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.three,
  },
  card: {
    borderWidth: 1,
    borderRadius: Radius.control,
    padding: Spacing.three,
    gap: Spacing.four,
  },
  step: {
    gap: Spacing.two,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    flexBasis: '22%',
    flexGrow: 1,
  },
  token: {
    flexBasis: '45%',
    flexGrow: 1,
  },
  amountEntry: {
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 72,
    fontSize: 40,
    fontFamily: FontFamily.semibold,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  centered: {
    textAlign: 'center',
  },
  orderHead: {
    gap: Spacing.one,
  },
  summary: {
    gap: Spacing.one,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Spacing.three,
    minHeight: 32,
  },
  summaryLabel: {
    flexShrink: 0,
  },
  summaryValue: {
    flex: 1,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  outcome: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  outcomeText: {
    flex: 1,
  },
  progress: {
    gap: Spacing.three,
  },
  progressBars: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  progressStep: {
    flex: 1,
    gap: Spacing.one,
  },
  progressBar: {
    height: 4,
    borderRadius: Radius.tile,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
