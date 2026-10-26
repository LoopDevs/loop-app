import { BuyPrice, type BuyQuote } from './buy-price.ts';
import type { GiftCard } from './client.ts';
import type { SendOutcome } from './payment-sender.ts';
import { PriceWindow } from './price-window.ts';

type OrderPayment = Pick<GiftCard, 'status' | 'paymentStatus' | 'paymentCryptoTxId'>;

export type BuySteps = {
  createOrder(): Promise<GiftCard>;
  paymentStarted(order: GiftCard): Promise<boolean>;
  pay(order: GiftCard): Promise<SendOutcome>;
  now(): number;
};

export type BuyResult =
  | { kind: 'payment'; order: GiftCard; outcome: SendOutcome }
  | { kind: 'confirm'; order: GiftCard; price: bigint }
  | { kind: 'refused'; order: GiftCard }
  | { kind: 'alreadyPaying'; order: GiftCard }
  | { kind: 'busy' };

const expired: SendOutcome = { state: { kind: 'priceExpired' }, resumed: false };

export class OneTapBuy {
  static readonly maxOrders = 2;

  private running = false;

  static paymentStarted(order: OrderPayment, sentHere: boolean): boolean {
    return (
      sentHere ||
      Boolean(order.paymentCryptoTxId) ||
      order.paymentStatus === 'paid' ||
      (order.status !== 'unpaid' && order.status !== 'expired')
    );
  }

  get busy(): boolean {
    return this.running;
  }

  start(steps: BuySteps, quote: BuyQuote): Promise<BuyResult> {
    return this.exclusive(async () => this.attempt(steps, await steps.createOrder(), quote));
  }

  confirm(steps: BuySteps, order: GiftCard, quote: BuyQuote): Promise<BuyResult> {
    return this.exclusive(() => this.attempt(steps, order, quote));
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

  private async attempt(steps: BuySteps, first: GiftCard, quote: BuyQuote): Promise<BuyResult> {
    let order = first;
    for (let orders = 1; ; orders += 1) {
      const check = BuyPrice.check(order, quote);
      if (check.kind === 'refuse') {
        return { kind: 'refused', order };
      }
      if (check.kind === 'confirm') {
        return { kind: 'confirm', order, price: check.price };
      }
      if (await steps.paymentStarted(order)) {
        return { kind: 'alreadyPaying', order };
      }
      const closed = PriceWindow.of(order)?.isClosed(steps.now()) ?? false;
      const outcome = closed ? expired : await steps.pay(order);
      if (outcome.state.kind !== 'priceExpired' || orders >= OneTapBuy.maxOrders) {
        return { kind: 'payment', order, outcome };
      }
      if (await steps.paymentStarted(order)) {
        return { kind: 'alreadyPaying', order };
      }
      order = await steps.createOrder();
    }
  }
}
