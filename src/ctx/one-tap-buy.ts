import { BuyPrice, type BuyQuote } from './buy-price.ts';
import type { GiftCard } from './client.ts';
import type { SendOutcome } from './payment-sender.ts';
import { resumedPaymentState, type PaymentState } from './payment-state.ts';
import { PriceWindow } from './price-window.ts';
import type { SentPayment } from './sent-payments.ts';

type OrderPayment = Pick<GiftCard, 'status' | 'paymentStatus' | 'paymentCryptoTxId'>;

export type SentRecord = Pick<SentPayment, 'txId' | 'expiryLedger'>;

export type BuySteps = {
  createOrder(): Promise<GiftCard>;
  paymentStarted(order: GiftCard, refetch: boolean): Promise<GiftCard | null>;
  pay(order: GiftCard): Promise<SendOutcome>;
  now(): number;
};

export type BuyResult =
  | { kind: 'payment'; order: GiftCard; outcome: SendOutcome }
  | { kind: 'confirm'; order: GiftCard; price: bigint }
  | { kind: 'refused'; order: GiftCard }
  | { kind: 'alreadyPaying'; order: GiftCard }
  | { kind: 'busy' };

export type ShownOrder = {
  order: GiftCard;
  payment: PaymentState;
  follow: boolean;
  sent: SentRecord | null;
};

export type BuyView =
  | { kind: 'rollBack'; message: string }
  | { kind: 'confirm'; order: GiftCard; price: bigint }
  | { kind: 'show'; shown: ShownOrder; celebrate: boolean };

const expired: SendOutcome = { state: { kind: 'priceExpired' }, resumed: false };

export class OneTapBuy {
  static readonly maxOrders = 2;
  static readonly notBoughtMessage = "Your card wasn't bought, and you weren't charged. Try again.";
  static readonly busyMessage = 'Another gift card purchase is still going. Try again in a moment.';

  private running = false;

  static paymentStarted(order: OrderPayment, sentHere: boolean): boolean {
    return (
      sentHere ||
      Boolean(order.paymentCryptoTxId) ||
      order.paymentStatus === 'paid' ||
      (order.status !== 'unpaid' && order.status !== 'expired')
    );
  }

  static paymentShown(order: OrderPayment, sent: SentRecord | null): PaymentState {
    if (order.status === 'unpaid') {
      return resumedPaymentState(order, sent);
    }
    if (order.status === 'expired' && sent && order.paymentStatus !== 'paid') {
      return { kind: 'confirming', txId: order.paymentCryptoTxId ?? sent.txId, expiryLedger: sent.expiryLedger };
    }
    return { kind: 'ready' };
  }

  static resumed(order: GiftCard | null, sent: SentRecord | null): ShownOrder | null {
    if (!order) {
      return null;
    }
    const payment = OneTapBuy.paymentShown(order, sent);
    if (order.status === 'unpaid' && payment.kind === 'ready') {
      return null;
    }
    return OneTapBuy.shown(order, payment, order.status === 'paid');
  }

  static view(result: BuyResult, sent: SentRecord | null): BuyView {
    switch (result.kind) {
      case 'busy':
        return { kind: 'rollBack', message: OneTapBuy.busyMessage };
      case 'refused':
        return { kind: 'rollBack', message: OneTapBuy.notBoughtMessage };
      case 'confirm':
        return { kind: 'confirm', order: result.order, price: result.price };
      case 'alreadyPaying': {
        const payment = OneTapBuy.paymentShown(result.order, sent);
        if (payment.kind === 'confirming') {
          return { kind: 'show', shown: OneTapBuy.shown(result.order, payment, true), celebrate: false };
        }
        const shown: ShownOrder = { order: result.order, payment: { kind: 'confirming' }, follow: true, sent: null };
        return { kind: 'show', shown, celebrate: false };
      }
      case 'payment': {
        const { state, resumed } = result.outcome;
        if (state.kind !== 'confirming') {
          const detail = state.kind === 'notSent' ? state.detail : '';
          return { kind: 'rollBack', message: detail !== '' ? detail : OneTapBuy.notBoughtMessage };
        }
        return { kind: 'show', shown: OneTapBuy.shown(result.order, state, true), celebrate: !resumed };
      }
    }
  }

  static checksChain(order: OrderPayment): boolean {
    return order.paymentStatus !== 'paid' && (order.status === 'unpaid' || order.status === 'expired');
  }

  static merged(held: GiftCard | null, current: GiftCard): GiftCard | null {
    if (!held || held.id !== current.id) {
      return held;
    }
    const { status, paymentStatus } = current;
    const paymentCryptoTxId = current.paymentCryptoTxId ?? held.paymentCryptoTxId;
    return { ...held, status, paymentStatus, paymentCryptoTxId };
  }

  private static shown(order: GiftCard, payment: PaymentState, paid: boolean): ShownOrder {
    const confirming = payment.kind === 'confirming';
    return {
      order,
      payment,
      follow: confirming || paid,
      sent: confirming ? { txId: payment.txId, expiryLedger: payment.expiryLedger } : null,
    };
  }

  get busy(): boolean {
    return this.running;
  }

  start(steps: BuySteps, quote: BuyQuote): Promise<BuyResult> {
    return this.exclusive(async () => this.attempt(steps, await steps.createOrder(), quote, true));
  }

  confirm(steps: BuySteps, order: GiftCard, quote: BuyQuote): Promise<BuyResult> {
    return this.exclusive(() => this.attempt(steps, order, quote, false));
  }

  private async exclusive(task: () => Promise<BuyResult>): Promise<BuyResult> {
    if (this.running) {
      return { kind: 'busy' };
    }
    this.running = true;
    try {
      return await task();
    } finally {
      this.running = false;
    }
  }

  private async attempt(
    steps: BuySteps,
    first: GiftCard,
    quote: BuyQuote,
    created: boolean,
  ): Promise<BuyResult> {
    let order = first;
    let justCreated = created;
    for (let orders = 1; ; orders += 1) {
      const check = BuyPrice.check(order, quote);
      if (check.kind === 'refuse') {
        return { kind: 'refused', order };
      }
      if (check.kind === 'confirm') {
        return { kind: 'confirm', order, price: check.price };
      }
      const paying = await steps.paymentStarted(order, !justCreated);
      if (paying) {
        return { kind: 'alreadyPaying', order: paying };
      }
      const closed = PriceWindow.of(order)?.isClosed(steps.now()) ?? false;
      const outcome = closed ? expired : await steps.pay(order);
      if (outcome.state.kind !== 'priceExpired' || orders >= OneTapBuy.maxOrders) {
        return { kind: 'payment', order, outcome };
      }
      const paidElsewhere = await steps.paymentStarted(order, true);
      if (paidElsewhere) {
        return { kind: 'alreadyPaying', order: paidElsewhere };
      }
      order = await steps.createOrder();
      justCreated = true;
    }
  }
}
