import assert from 'node:assert/strict';
import { test } from 'node:test';

import { units } from '../stellar/units.ts';
import type { BuyQuote } from './buy-price.ts';
import type { GiftCard } from './client.ts';
import { OneTapBuy, type BuySteps } from './one-tap-buy.ts';
import type { SendOutcome } from './payment-sender.ts';
import type { PaymentState } from './payment-state.ts';
import { Rates } from './rates.ts';

const now = Date.parse('2026-10-26T12:00:00Z');
const quote: BuyQuote = { shown: units.parse('25'), currency: 'XLM.USDC', usdPrice: Rates.one };
const confirming: PaymentState = { kind: 'confirming', txId: 'tx' };
const priceExpired: PaymentState = { kind: 'priceExpired' };

function giftCard(n: number, overrides: Partial<GiftCard> = {}): GiftCard {
  return {
    id: `order-${n}`,
    status: 'unpaid',
    merchantId: 'm1',
    merchantName: 'Aerie',
    created: '2026-10-26T12:00:00Z',
    cardFiatAmount: '25',
    cardFiatCurrency: 'USD',
    paymentId: `payment-${n}`,
    paymentStatus: 'unpaid',
    paymentMethod: 'crypto',
    paymentCryptoAmount: '25',
    paymentCryptoCurrency: 'XLM.USDC',
    paymentUrlExpiration: new Date(now + 600_000).toISOString(),
    ...overrides,
  };
}

class FakeShop implements BuySteps {
  readonly created: GiftCard[] = [];
  readonly paid: string[] = [];
  readonly started = new Set<string>();
  orderOverrides: Partial<GiftCard>[] = [];
  payStates: PaymentState[] = [confirming];

  async createOrder(): Promise<GiftCard> {
    const order = giftCard(this.created.length + 1, this.orderOverrides[this.created.length]);
    this.created.push(order);
    return order;
  }

  async paymentStarted(order: GiftCard): Promise<boolean> {
    return this.started.has(order.paymentId);
  }

  async pay(order: GiftCard): Promise<SendOutcome> {
    this.paid.push(order.paymentId);
    const state = this.payStates[this.paid.length - 1] ?? confirming;
    if (state.kind === 'confirming') {
      this.started.add(order.paymentId);
    }
    return { state, resumed: false };
  }

  now(): number {
    return now;
  }
}

test('one tap creates one order and pays it once', async () => {
  const shop = new FakeShop();
  const result = await new OneTapBuy().start(shop, quote);
  assert.equal(result.kind, 'payment');
  assert.equal(shop.created.length, 1);
  assert.deepEqual(shop.paid, ['payment-1']);
});

test('an order priced more than the tolerance above the shown price is not paid', async () => {
  const shop = new FakeShop();
  shop.orderOverrides = [{ paymentCryptoAmount: '25.26' }];
  const result = await new OneTapBuy().start(shop, quote);
  assert.deepEqual(result, { kind: 'confirm', order: shop.created[0], price: units.parse('25.26') });
  assert.deepEqual(shop.paid, []);
});

test('a confirmed price pays the same order without creating another', async () => {
  const shop = new FakeShop();
  const order = giftCard(7, { paymentCryptoAmount: '25.26' });
  const result = await new OneTapBuy().confirm(shop, order, { ...quote, shown: units.parse('25.26') });
  assert.equal(result.kind, 'payment');
  assert.equal(shop.created.length, 0);
  assert.deepEqual(shop.paid, ['payment-7']);
});

test('an order in a currency other than the requested one is never paid', async () => {
  const shop = new FakeShop();
  shop.orderOverrides = [{ paymentCryptoCurrency: 'XLM', paymentCryptoAmount: '20' }];
  const result = await new OneTapBuy().start(shop, quote);
  assert.equal(result.kind, 'refused');
  assert.deepEqual(shop.paid, []);
});

test('an expired price creates one fresh order and pays that one', async () => {
  const shop = new FakeShop();
  shop.payStates = [priceExpired, confirming];
  const result = await new OneTapBuy().start(shop, quote);
  assert.equal(result.kind, 'payment');
  assert.equal(result.kind === 'payment' && result.order.id, 'order-2');
  assert.deepEqual(shop.paid, ['payment-1', 'payment-2']);
});

test('a price that expires twice stops after the second order', async () => {
  const shop = new FakeShop();
  shop.payStates = [priceExpired, priceExpired];
  const result = await new OneTapBuy().start(shop, quote);
  assert.equal(result.kind === 'payment' && result.outcome.state.kind, 'priceExpired');
  assert.equal(shop.created.length, OneTapBuy.maxOrders);
  assert.equal(shop.paid.length, OneTapBuy.maxOrders);
});

test('a closed payment window skips paying and creates a fresh order', async () => {
  const shop = new FakeShop();
  shop.orderOverrides = [{ paymentUrlExpiration: new Date(now + 10_000).toISOString() }];
  const result = await new OneTapBuy().start(shop, quote);
  assert.equal(result.kind === 'payment' && result.order.id, 'order-2');
  assert.deepEqual(shop.paid, ['payment-2']);
});

test('an expired order whose payment started is followed, not replaced', async () => {
  const shop = new FakeShop();
  shop.payStates = [priceExpired];
  const pay = shop.pay.bind(shop);
  shop.pay = async (order) => {
    const outcome = await pay(order);
    shop.started.add(order.paymentId);
    return outcome;
  };
  const result = await new OneTapBuy().start(shop, quote);
  assert.equal(result.kind, 'alreadyPaying');
  assert.equal(shop.created.length, 1);
});

test('an order whose payment already started is not paid again', async () => {
  const shop = new FakeShop();
  shop.started.add('payment-1');
  const result = await new OneTapBuy().start(shop, quote);
  assert.equal(result.kind, 'alreadyPaying');
  assert.deepEqual(shop.paid, []);
});

test('a second tap while buying is ignored', async () => {
  const shop = new FakeShop();
  const buy = new OneTapBuy();
  const [first, second] = await Promise.all([buy.start(shop, quote), buy.start(shop, quote)]);
  assert.equal(first.kind, 'payment');
  assert.equal(second.kind, 'busy');
  assert.equal(shop.created.length, 1);
  assert.deepEqual(shop.paid, ['payment-1']);
});

test('a tap after the last buy finished starts a new buy', async () => {
  const shop = new FakeShop();
  const buy = new OneTapBuy();
  await buy.start(shop, quote);
  await buy.start(shop, quote);
  assert.equal(shop.created.length, 2);
});

test('a failed create releases the guard', async () => {
  const shop = new FakeShop();
  const buy = new OneTapBuy();
  const create = shop.createOrder.bind(shop);
  shop.createOrder = async () => {
    throw new Error('offline');
  };
  await assert.rejects(buy.start(shop, quote), /offline/);
  shop.createOrder = create;
  assert.equal((await buy.start(shop, quote)).kind, 'payment');
});

test('payment counts as started once sent here, on chain or past unpaid', () => {
  const unpaid = { status: 'unpaid', paymentStatus: 'unpaid' } as const;
  assert.equal(OneTapBuy.paymentStarted(unpaid, false), false);
  assert.equal(OneTapBuy.paymentStarted({ ...unpaid, status: 'expired', paymentStatus: 'expired' }, false), false);
  assert.equal(OneTapBuy.paymentStarted(unpaid, true), true);
  assert.equal(OneTapBuy.paymentStarted({ ...unpaid, paymentCryptoTxId: 'tx' }, false), true);
  assert.equal(OneTapBuy.paymentStarted({ ...unpaid, paymentStatus: 'paid' }, false), true);
  assert.equal(OneTapBuy.paymentStarted({ status: 'paid', paymentStatus: 'unpaid' }, false), true);
});
