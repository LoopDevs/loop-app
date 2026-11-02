import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePreventRemove, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { dismissBrowser, openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  FadeInLeft,
  FadeInRight,
  FadeOutLeft,
  FadeOutRight,
  useReducedMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExternalLink } from '@/components/external-link';
import { LogoDisc } from '@/components/merchant-mark';
import { PayTopBar } from '@/components/pay-top-bar';
import { PurchaseConfirm, PurchaseDelivered, PurchaseProgress } from '@/components/purchase-progress';
import { Button, Field, Notice } from '@/components/ui/form';
import { ThemedText } from '@/components/ui/themed-text';
import { useToast } from '@/components/ui/toast';
import { loopLinks } from '@/constants/loop-links';
import { FontFamily, Layout, Motion, Radius, Spacing } from '@/constants/theme';
import { amountErrorMessage } from '@/ctx/amount-error';
import { normalizeAmount } from '@/ctx/amount-input';
import { BankPayment } from '@/ctx/bank-payment';
import { BuyPrice, type BuyQuote } from '@/ctx/buy-price';
import { BuyTimer } from '@/ctx/buy-timer';
import { OrderWake } from '@/ctx/order-wake';
import { ctx, CtxError, type GiftCard } from '@/ctx/client';
import { currencyRefusalMessage, refusesCurrency } from '@/ctx/currency-refusal';
import { dismissedOrders } from '@/ctx/dismissed-orders';
import { InFlightPayments } from '@/ctx/in-flight-payments';
import { isHiddenFromHistory, settledStatuses } from '@/ctx/gift-card-status';
import type { Merchant } from '@/ctx/merchant';
import { OneTapBuy, type BuyResult, type BuySteps, type SentRecord, type ShownOrder } from '@/ctx/one-tap-buy';
import { paymentLock } from '@/ctx/payment-lock';
import { PaymentSender, type SendOutcome } from '@/ctx/payment-sender';
import {
  canPay,
  sentTransactionOutcome,
  type PaymentState,
  type PayRejection,
  type SignedTransfer,
} from '@/ctx/payment-state';
import { PriceWindow } from '@/ctx/price-window';
import { Profile } from '@/ctx/profile';
import { Rates } from '@/ctx/rates';
import { errorMessage, useBusyAction } from '@/hooks/use-busy-action';
import { useHoldings } from '@/hooks/use-holdings';
import { usePageLayout } from '@/hooks/use-page-layout';
import { sentPayments } from '@/hooks/use-sent-payment';
import { useTheme } from '@/hooks/use-theme';
import { money } from '@/money';
import { haptics } from '@/native/haptics';
import { errorReporting } from '@/ops/error-reporting';
import { network, offeredTokens, onlyPaymentCurrency, type PaymentCurrency, type Token } from '@/stellar/network';
import { soroban } from '@/stellar/soroban';
import { units } from '@/stellar/units';
import { holdCriticalReload } from '@/updates/update-checker';
import type { Coverage, Holdings } from '@/wallet/holdings';
import { PaymentSearch } from '@/wallet/payment-search';
import { PendingWithdrawals } from '@/wallet/pending-withdrawals';
import { Savings } from '@/wallet/savings';
import type { TopUpOutcome } from '@/wallet/savings-top-up';
import type { SmartWallet } from '@/wallet/smart-wallet';

type Props = {
  merchant: Merchant;
  wallet: SmartWallet;
  profile: Profile;
  onProfile: (profile: Profile) => void;
  onClose: () => void;
};

type Step = 'review' | 'terms' | 'confirm' | 'progress' | 'delivered';

const stepOrder: Record<Step, number> = {
  review: 0,
  terms: 1,
  confirm: 2,
  progress: 2,
  delivered: 3,
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
  if (expiryLedger === undefined || !token) {
    return null;
  }
  if (await wallet.paymentMissing(token, await signedTransfer(giftCard), expiryLedger)) {
    return { kind: 'failed' };
  }
  return null;
}

async function signedTransfer(giftCard: GiftCard): Promise<SignedTransfer | null> {
  const recorded = await sentPayments.get(giftCard.paymentId);
  return recorded?.transfer ?? PaymentSearch.orderTransfer(giftCard)?.expected ?? null;
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

const paymentSender = new PaymentSender(sentPayments, payRejection, paymentLock);
const pendingTopUps = new PendingWithdrawals(AsyncStorage);
const inFlightPayments = new InFlightPayments();
const oneTapBuy = new OneTapBuy();
const noRates = new Rates(new Map());
const purchaseTermsKey = (userId: string) => `loop.purchaseTermsAccepted.${userId}`;
const purchaseTerms = [
  "Once your gift card is delivered, you can't cancel or return it, except where the law gives you that right. If a card is faulty or never arrives, contact support and we will put it right.",
  'Cashback is credited to your Loop account once your gift card is delivered.',
  "Each gift card is subject to the brand's own terms, including where it can be used and any expiry date.",
];

export function GiftCardPurchase({ merchant, wallet, profile, onProfile, onClose }: Props) {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { wide } = usePageLayout();
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
  const [termsAcceptedBy, setTermsAcceptedBy] = useState<string | null>(null);
  const [showingTerms, setShowingTerms] = useState(false);
  const { view, refresh } = useHoldings(wallet);
  const toast = useToast();
  const [shownStep, setShownStep] = useState<Step>('review');
  const [forward, setForward] = useState(true);

  useEffect(() => {
    let current = true;
    const userId = wallet.userId;
    AsyncStorage.getItem(purchaseTermsKey(userId))
      .catch(() => null)
      .then((accepted) => {
        if (current && accepted === 'yes') {
          setTermsAcceptedBy(userId);
        }
      });
    return () => {
      current = false;
    };
  }, [wallet.userId]);

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
  const shownPrice = fiatAmount ? BuyPrice.shown(fiatAmount, (cardRates ?? noRates).usdPrice(merchant.currency)) : null;
  const balance = view && currency ? view.holdings.spendable(currency) : null;
  const tokenPrice = shownPrice !== null && usdPrice !== null ? BuyPrice.inTokens(shownPrice, usdPrice) : null;
  const shownBalance = balance === null ? null : balance > spent ? balance - spent : 0n;

  const following = useRef(0);
  const buyTimer = useRef<BuyTimer | null>(null);
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

  const pollOrder = useCallback(
    async (giftCard: GiftCard, sent: SentRecord | null, isCurrent: () => boolean, wake: OrderWake) => {
      let current = giftCard;
      let landed = false;
      while (isCurrent()) {
        if (BankPayment.linkExpired(current, Date.now())) {
          setPayment((held) => (held.kind === 'bank' && held.linkOpen ? { kind: 'bank', linkOpen: false } : held));
        }
        if (sent && OneTapBuy.checksChain(current)) {
          const failure = await sentPaymentFailure(current, live.current.wallet, {
            txId: sent.txId ?? current.paymentCryptoTxId,
            expiryLedger: sent.expiryLedger,
          }).catch(() => null);
          if (!isCurrent()) {
            return;
          }
          if (failure) {
            setPayment(failure);
            setSpent(0n);
            return;
          }
        }
        if (settledStatuses.includes(current.status)) {
          return;
        }
        await wake.wait(wake.interval());
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
        if (current.status === 'fulfilled') {
          buyTimer.current?.mark('card shown');
          buyTimer.current = null;
        }
        if (!landed && current.paymentStatus === 'paid') {
          landed = true;
          buyTimer.current?.mark('paid seen');
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
    },
    [],
  );

  const followOrder = useCallback(
    async (giftCard: GiftCard, sent: SentRecord | null) => {
      const generation = ++following.current;
      const isCurrent = () => following.current === generation;
      const wake = new OrderWake();
      const stopWatching = ctx.watchOrder(giftCard.id, wake).catch(() => () => undefined);
      try {
        await pollOrder(giftCard, sent, isCurrent, wake);
      } finally {
        void stopWatching.then((stop) => stop());
      }
    },
    [pollOrder],
  );

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
        let giftCard = held ? await ctx.giftCard(held.id) : await dismissedOrders.activeOrder(merchant.id);
        while (giftCard && inFlightPayments.has(giftCard.paymentId)) {
          show({
            order: giftCard,
            payment: { kind: 'sending' },
            follow: false,
            sent: null,
          });
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

  const topUpFromSavings = async (
    giftCard: GiftCard,
    currency: PaymentCurrency,
    price: bigint,
  ): Promise<PaymentState | null> => {
    setPayment({ kind: 'movingSavings' });
    let outcome: TopUpOutcome;
    try {
      outcome = await wallet
        .savingsTopUp(currency)
        .run(price, PriceWindow.of(giftCard), await pendingTopUps.get(wallet.address, currency));
    } finally {
      refresh().catch((error: unknown) => setMessage(errorMessage(error)));
    }
    const unconfirmed = outcome.kind === 'stillMoving' || outcome.kind === 'covered' ? outcome.withdrawal : undefined;
    if (unconfirmed) {
      await pendingTopUps.set(wallet.address, currency, unconfirmed);
    } else {
      await pendingTopUps.delete(wallet.address, currency);
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
    const savingsCurrency = Savings.takes(giftCard.paymentCryptoCurrency) ? giftCard.paymentCryptoCurrency : null;
    const toppingUp =
      savingsCurrency !== null && (coverage?.kind === 'savings' || (await hasPendingTopUp(wallet, savingsCurrency)));
    if (coverage?.kind === 'short' && !toppingUp) {
      return {
        state: { kind: 'notSent', detail: notEnoughMessage },
        resumed: false,
      };
    }
    const topUpPrice = toppingUp ? orderPrice(giftCard) : null;
    const send = async (): Promise<SendOutcome> => {
      const recorded = await paymentSender.recorded(giftCard.paymentId);
      if (recorded) {
        return { state: recorded, resumed: true };
      }
      if (topUpPrice !== null && savingsCurrency !== null) {
        const settled = OneTapBuy.beforeTopUp(await ctx.giftCard(giftCard.id));
        if (settled) {
          return settled;
        }
        const stopped = await topUpFromSavings(giftCard, savingsCurrency, topUpPrice);
        if (stopped) {
          return { state: stopped, resumed: false };
        }
      }
      setPayment({ kind: 'sending' });
      return paymentSender.send(giftCard.paymentId, () => wallet.pay(giftCard, buyTimer.current));
    };
    const task = inFlightPayments.start(giftCard.paymentId, () =>
      holdCriticalReload(() => paymentLock.exclusive(`spend:${wallet.address}`, send)),
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
        buyTimer.current?.mark('order created');
        setOrder(created);
        setSpent((held) => orderPrice(created) ?? held);
        return created;
      },
      paymentStarted: async (giftCard, refetch) => {
        if (inFlightPayments.has(giftCard.paymentId)) {
          return giftCard;
        }
        const sentHere = (await paymentSender.recorded(giftCard.paymentId)) !== null;
        const fetched = refetch ? await ctx.giftCard(giftCard.id) : giftCard;
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
        if (view.notice) {
          setMessage(view.notice);
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
      if (BankPayment.linkRefused(giftCard)) {
        errorReporting.reportMessage(`Bank approval link refused for order ${giftCard.id}`);
      }
      return;
    }
    await openBrowserAsync(link, {
      presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
    });
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
      setPayment({ kind: 'bank', linkOpen: true });
      haptics.tap();
      void followOrder(created, null);
      if (process.env.EXPO_OS !== 'web') {
        void approveAtBank(created);
      }
    });

  const short = !byBank && tokenPrice !== null && balance !== null && tokenPrice > balance;
  const walletReady = currency !== null && view !== null && cardRates !== null && usdPrice !== null && !short;
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
    buyTimer.current = BuyTimer.dev();
    stopFollowing();
    setMessage('');
    setAmountError(null);
    setConfirmPrice(null);
    setOrder(null);
    setDraftAmount(fiatAmount);
    setPayment({ kind: 'sending' });
    setSpent(tokenPrice ?? 0n);
    void settle(currency, () => oneTapBuy.start(buySteps(fiatAmount, currency), quote));
  };

  const startBuy = () => {
    if (termsAcceptedBy === wallet.userId) {
      buy();
      return;
    }
    setShowingTerms(true);
  };

  const agreeAndBuy = () => {
    const userId = wallet.userId;
    setTermsAcceptedBy(userId);
    setShowingTerms(false);
    AsyncStorage.setItem(purchaseTermsKey(userId), 'yes').catch(() => setTermsAcceptedBy(null));
    buy();
  };

  const payConfirmedPrice = () => {
    if (!order || confirmPrice === null || !currency || !canPay(order, payment)) {
      return;
    }
    const quote: BuyQuote = { shown: confirmPrice, currency, usdPrice };
    buyTimer.current = BuyTimer.dev();
    setConfirmPrice(null);
    setPayment({ kind: 'sending' });
    setSpent(orderPrice(order) ?? (usdPrice === null ? 0n : (BuyPrice.inTokens(confirmPrice, usdPrice) ?? 0n)));
    void settle(currency, () => oneTapBuy.confirm(buySteps(order.cardFiatAmount, currency), order, quote));
  };

  const startOver = () => {
    rollBack();
    setMessage('');
    refresh().catch((error: unknown) => setMessage(errorMessage(error)));
  };

  const cancelOrder = () => {
    const cancelled = order;
    if (cancelled) {
      void dismissedOrders.dismiss(cancelled);
    }
    startOver();
    if (cancelled && BankPayment.isBank(cancelled)) {
      toast('If you already approved it at your bank, the card will still arrive.');
    }
  };

  const tryAgain = () => {
    rollBack();
    startBuy();
  };

  const viewCard = () => {
    const shown = order;
    startOver();
    onClose();
    if (shown && !isHiddenFromHistory(shown)) {
      router.push(`/wallet/${shown.id}`, { withAnchor: true });
    }
  };

  const finish = () => {
    startOver();
    onClose();
  };

  const working = payment.kind === 'sending' || payment.kind === 'movingSavings';
  const step: Step =
    order?.status === 'fulfilled'
      ? 'delivered'
      : confirmPrice !== null && order
        ? 'confirm'
        : order || draftAmount
          ? 'progress'
          : showingTerms
            ? 'terms'
            : 'review';
  if (step !== shownStep) {
    setForward(stepOrder[step] >= stepOrder[shownStep]);
    setShownStep(step);
  }
  const closeStep = () => {
    if (step === 'confirm') {
      cancelOrder();
    }
    onClose();
  };
  const cardAmount = order?.cardFiatAmount ?? draftAmount ?? fiatAmount ?? '';
  const balanceText = shownBalance === null || !currency ? null : money.token(shownBalance, currency);
  const estimate = merchant.cashbackEstimate(fiatAmount ?? '');
  const range = merchant.rangeLabel();
  const cardLabel = fiatAmount ? merchant.shortAmount(fiatAmount) : null;
  const bankPrice = fiatAmount ? money.fiat(fiatAmount, merchant.currency) : null;
  const walletPrice =
    tokenPrice !== null && currency
      ? money.token(tokenPrice, currency)
      : shownPrice !== null
        ? dollars(shownPrice)
        : null;
  const priceText = bankOrder
    ? order
      ? money.fiat(order.cardFiatAmount, order.cardFiatCurrency)
      : bankPrice
    : walletPrice;
  const walletOptions = onlyPaymentCurrency
    ? offeredTokens.filter((token) => token.currency === onlyPaymentCurrency)
    : offeredTokens;
  const topPadding = Platform.OS === 'ios' ? Spacing.two : insets.top + Spacing.two;
  const bottomPadding = insets.bottom + Spacing.three;
  const stepContent = () => {
    switch (step) {
      case 'delivered':
        return order && <PurchaseDelivered order={order} onView={viewCard} onDone={finish} />;
      case 'confirm':
        return (
          confirmPrice !== null && (
            <PurchaseConfirm
              merchant={merchant}
              cardAmount={cardAmount}
              price={confirmPrice}
              busy={busy}
              onConfirm={payConfirmedPrice}
              onCancel={cancelOrder}
            />
          )
        );
      case 'progress':
        return (
          <PurchaseProgress
            merchant={merchant}
            cardAmount={cardAmount}
            order={order}
            payment={payment}
            priceText={priceText}
            busy={busy}
            onApprove={approveAtBank}
            onRetry={tryAgain}
            onCancel={cancelOrder}
            onDone={finish}
          />
        );
      case 'terms':
        return (
          <View style={styles.stage}>
            <View style={styles.body}>
              <PurchaseTerms />
            </View>
            <View style={styles.footer}>
              <Button label="Agree and buy" variant="primary" onPress={agreeAndBuy} disabled={!canBuy} />
              <Button label="Not now" variant="quiet" onPress={() => setShowingTerms(false)} />
            </View>
          </View>
        );
      case 'review':
        return (
          <View style={styles.stage}>
            <ScrollView
              style={styles.stage}
              contentContainerStyle={styles.review}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag">
              <View style={styles.merchantRow}>
                <LogoDisc merchant={merchant} name={merchant.name} size={52} />
                <View style={styles.merchantText}>
                  <ThemedText type="heading" numberOfLines={1}>
                    {merchant.name}
                  </ThemedText>
                  {merchant.cashbackBasisPoints() > 0 && (
                    <ThemedText type="small" themeColor="success">
                      {merchant.rateLabel()} cashback
                    </ThemedText>
                  )}
                </View>
              </View>

              <View style={styles.hero}>
                <ThemedText type="small" themeColor="textSecondary">
                  Gift card amount
                </ThemedText>
                {merchant.denominationType === 'fixed' ? (
                  <ThemedText style={styles.heroAmount} accessibilityLiveRegion="polite">
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
                {(amountProblem ?? amountError) && <InlineError text={(amountProblem ?? amountError) as string} />}
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
                          selected={
                            fiatAmount !== null && units.parseTruncated(fiatAmount) === units.parseTruncated(quick)
                          }
                          onPress={() => changeAmount(quick)}
                        />
                      ))}
              </View>

              <View style={[styles.group, { backgroundColor: theme.backgroundSubtle }]}>
                <SummaryRow label="You pay" value={byBank ? bankPrice : walletPrice} />
                <SummaryRow label="Cashback" value={estimate ? `About ${estimate}` : null} emphasis />
                {!byBank && <SummaryRow label="Your balance" value={balanceText} />}
                {short && <InlineError text={notEnoughMessage} />}
              </View>

              {(onlyPaymentCurrency === null || bankOffered) && (
                <View style={styles.section}>
                  <ThemedText type="smallBold">Pay with</ThemedText>
                  <View style={styles.options} accessibilityRole="radiogroup">
                    {bankOffered && (
                      <Button
                        label={BankPayment.rail(merchant.currency)?.bankLabel ?? 'Bank account'}
                        onPress={() => setChosen(BankPayment.option)}
                        selected={byBank}
                      />
                    )}
                    {walletOptions.map((token) => (
                      <Button
                        key={token.currency}
                        label={tokenLabel(token, view?.holdings ?? null)}
                        onPress={() => setChosen(token.currency)}
                        selected={!byBank && currency === token.currency}
                        disabled={
                          refusedCurrencies.has(token.currency) || view?.holdings.spendable(token.currency) === 0n
                        }
                      />
                    ))}
                  </View>
                  {byBank && (
                    <ThemedText type="small" themeColor="textSecondary">
                      You approve the payment in your banking app. Cashback is paid in pounds.
                    </ThemedText>
                  )}
                </View>
              )}

              {legalNameNeeded && (
                <View style={styles.section}>
                  <Field
                    label="Name on your bank account"
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
            </ScrollView>
            <View style={styles.footer}>
              {message !== '' && <Notice message={message} />}
              <Button
                label={cardLabel ? `Buy ${cardLabel} gift card` : 'Buy gift card'}
                variant="primary"
                onPress={startBuy}
                disabled={!canBuy}
              />
            </View>
          </View>
        );
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: topPadding, paddingBottom: bottomPadding }]}>
      <View style={[styles.stage, wide && styles.sheet]}>
        {!working && step !== 'delivered' && (
          <PayTopBar
            title={merchant.name}
            onBack={step === 'terms' ? () => setShowingTerms(false) : step === 'confirm' ? cancelOrder : undefined}
            onClose={closeStep}
          />
        )}
        <Animated.View
          key={step}
          style={styles.stage}
          entering={reduceMotion ? undefined : (forward ? FadeInRight : FadeInLeft).duration(Motion.transition)}
          exiting={reduceMotion ? undefined : (forward ? FadeOutLeft : FadeOutRight).duration(Motion.exit)}>
          {stepContent()}
          {step !== 'review' && message !== '' && (
            <View style={styles.footer}>
              <Notice message={message} />
            </View>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

function PurchaseTerms() {
  return (
    <View style={styles.section} accessibilityLiveRegion="polite">
      <ThemedText type="subtitle" accessibilityRole="header">
        Before your first gift card
      </ThemedText>
      {purchaseTerms.map((term) => (
        <ThemedText key={term} type="small" themeColor="textSecondary">
          {term}
        </ThemedText>
      ))}
      <ThemedText type="small" themeColor="textSecondary">
        Read the full{' '}
        <ExternalLink href={loopLinks.terms} style={styles.termsLink}>
          Terms
        </ExternalLink>
        .
      </ThemedText>
    </View>
  );
}

function AmountChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <View style={styles.chip}>
      <Button label={label} onPress={onPress} selected={selected} variant="secondary" />
    </View>
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
      style={[styles.amountEntry, { color: theme.text }]}
    />
  );
}

function SummaryRow({ label, value, emphasis = false }: { label: string; value: string | null; emphasis?: boolean }) {
  if (value === null) {
    return null;
  }
  return (
    <View style={styles.summaryRow}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.summaryLabel}>
        {label}
      </ThemedText>
      <ThemedText
        type={emphasis ? 'smallBold' : 'small'}
        themeColor={emphasis ? 'success' : 'text'}
        style={styles.summaryValue}>
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

async function hasPendingTopUp(wallet: SmartWallet, currency: PaymentCurrency): Promise<boolean> {
  return (await pendingTopUps.get(wallet.address, currency)) !== undefined;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  sheet: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: Layout.sheetWidth,
  },
  stage: {
    flex: 1,
  },
  body: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  review: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    gap: Spacing.four,
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  section: {
    gap: Spacing.two,
  },
  termsLink: {
    textDecorationLine: 'underline',
  },
  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  merchantText: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.half,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  heroAmount: {
    fontFamily: FontFamily.bold,
    fontSize: 56,
    lineHeight: 64,
    letterSpacing: -1.5,
    fontVariant: ['tabular-nums'],
  },
  amountEntry: {
    alignSelf: 'stretch',
    minHeight: 64,
    fontSize: 56,
    lineHeight: 64,
    letterSpacing: -1.5,
    fontFamily: FontFamily.bold,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    padding: 0,
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
  chip: {
    minWidth: 72,
  },
  group: {
    borderRadius: Radius.large,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  options: {
    gap: Spacing.two,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Spacing.three,
    minHeight: 44,
  },
  summaryLabel: {
    flexShrink: 0,
  },
  summaryValue: {
    flex: 1,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});
