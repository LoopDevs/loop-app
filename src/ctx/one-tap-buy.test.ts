import assert from 'node:assert/strict';
import { test } from 'node:test';

import { units } from '../stellar/units.ts';
import type { BuyQuote } from './buy-price.ts';
import type { GiftCard } from './client.ts';
import { OneTapBuy, type BuySteps } from './one-tap-buy.ts';
import { PaymentSender, type PaymentLock, type SendOutcome } from './payment-sender.ts';
import type { PayRejection } from './payment-state.ts';
import { Rates } from './rates.ts';
import { SentPayments, type SentPaymentStorage } from './sent-payments.ts';

const now = Date.parse('2026-10-26T12:00:00Z');
const quote: BuyQuote = { shown: units.parse('25'), currency: 'XLM.USDC', usdPrice: Rates.one };
const closedRejection: PayRejection = { status: 400, message: 'payment is no longer open' };

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

function memoryStorage(): SentPaymentStorage {
  const values = new Map<string, string>();
  return {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
    async getAllKeys() {
      return [...values.keys()];
    },
  };
}

class Rejected extends Error {
  readonly rejection: PayRejection;

  constructor(rejection: PayRejection) {
    super('rejected');
    this.rejection = rejection;
  }
}

const noLock: PaymentLock = {
  exclusive: (_name, task) => task(),
};

type Sponsor = 'accepted' | 'closed' | 'paidElsewhere';

class FakeShop implements BuySteps {
  readonly created: GiftCard[] = [];
  readonly sponsored: string[] = [];
  readonly refetches: boolean[] = [];
  readonly records = new SentPayments(memoryStorage(), () => now);
  readonly sender = new PaymentSender(
    this.records,
    (error) => (error instanceof Rejected ? error.rejection : undefined),
    noLock,
  );
  readonly ctxOrders = new Map<string, Partial<GiftCard>>();
  orderOverrides: Partial<GiftCard>[] = [];
  sponsors: Sponsor[] = [];

  async createOrder(): Promise<GiftCard> {
    const order = giftCard(this.created.length + 1, this.orderOverrides[this.created.length]);
    this.created.push(order);
    return order;
  }

  async paymentStarted(order: GiftCard, refetch: boolean): Promise<GiftCard | null> {
    this.refetches.push(refetch);
    const fetched = refetch ? { ...order, ...this.ctxOrders.get(order.id) } : order;
    const sentHere = (await this.sender.recorded(order.paymentId)) !== null;
    return OneTapBuy.paymentStarted(fetched, sentHere) ? fetched : null;
  }

  pay(order: GiftCard): Promise<SendOutcome> {
    return this.sender.send(order.paymentId, async () => ({
      expiryLedger: 500,
      transfer: { amount: 25n },
      sponsor: async () => {
        this.sponsored.push(order.paymentId);
        const sponsor = this.sponsors[this.sponsored.length - 1] ?? 'accepted';
        if (sponsor === 'paidElsewhere') {
          this.ctxOrders.set(order.id, { status: 'paid', paymentStatus: 'paid' });
        }
        if (sponsor !== 'accepted') {
          throw new Rejected(closedRejection);
        }
        return { hash: `tx-${order.paymentId}` };
      },
    }));
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
  assert.deepEqual(shop.sponsored, ['payment-1']);
});

test('an order priced more than the tolerance above the shown price is not paid', async () => {
  const shop = new FakeShop();
  shop.orderOverrides = [{ paymentCryptoAmount: '25.26' }];
  const result = await new OneTapBuy().start(shop, quote);
  assert.deepEqual(result, { kind: 'confirm', order: shop.created[0], price: units.parse('25.26') });
  assert.deepEqual(shop.sponsored, []);
});

test('a just created order is not fetched again, a confirmed one is', async () => {
  const shop = new FakeShop();
  await new OneTapBuy().start(shop, quote);
  assert.deepEqual(shop.refetches, [false]);
  const confirmShop = new FakeShop();
  await new OneTapBuy().confirm(confirmShop, giftCard(7), quote);
  assert.deepEqual(confirmShop.refetches, [true]);
});

test('a confirmed price pays the same order without creating another', async () => {
  const shop = new FakeShop();
  const order = giftCard(7, { paymentCryptoAmount: '25.26' });
  const result = await new OneTapBuy().confirm(shop, order, { ...quote, shown: units.parse('25.26') });
  assert.equal(result.kind, 'payment');
  assert.equal(shop.created.length, 0);
  assert.deepEqual(shop.sponsored, ['payment-7']);
});

test('an order in a currency other than the requested one is never paid', async () => {
  const shop = new FakeShop();
  shop.orderOverrides = [{ paymentCryptoCurrency: 'XLM', paymentCryptoAmount: '20' }];
  const result = await new OneTapBuy().start(shop, quote);
  assert.equal(result.kind, 'refused');
  assert.deepEqual(shop.sponsored, []);
});

test('a payment CTX refuses as no longer open, before submitting it, is forgotten and one fresh order is paid', async () => {
  const shop = new FakeShop();
  shop.sponsors = ['closed', 'accepted'];
  const result = await new OneTapBuy().start(shop, quote);
  assert.equal(result.kind === 'payment' && result.order.id, 'order-2');
  assert.equal(result.kind === 'payment' && result.outcome.state.kind, 'confirming');
  assert.deepEqual(shop.sponsored, ['payment-1', 'payment-2']);
  assert.equal(await shop.records.get('payment-1'), null);
  assert.notEqual(await shop.records.get('payment-2'), null);
});

test('a price that expires twice stops after the second order', async () => {
  const shop = new FakeShop();
  shop.sponsors = ['closed', 'closed'];
  const result = await new OneTapBuy().start(shop, quote);
  assert.equal(result.kind === 'payment' && result.outcome.state.kind, 'priceExpired');
  assert.equal(shop.created.length, OneTapBuy.maxOrders);
  assert.equal(shop.sponsored.length, OneTapBuy.maxOrders);
});

test('a closed payment window skips paying and creates a fresh order', async () => {
  const shop = new FakeShop();
  shop.orderOverrides = [{ paymentUrlExpiration: new Date(now + 10_000).toISOString() }];
  const result = await new OneTapBuy().start(shop, quote);
  assert.equal(result.kind === 'payment' && result.order.id, 'order-2');
  assert.deepEqual(shop.sponsored, ['payment-2']);
});

test('a closed payment whose order CTX shows as paid is followed as fetched, not replaced', async () => {
  const shop = new FakeShop();
  shop.sponsors = ['paidElsewhere'];
  const result = await new OneTapBuy().start(shop, quote);
  assert.equal(result.kind, 'alreadyPaying');
  assert.equal(result.kind === 'alreadyPaying' && result.order.status, 'paid');
  assert.equal(shop.created.length, 1);
});

test('an order whose payment is recorded on this device is not paid again', async () => {
  const shop = new FakeShop();
  await shop.records.sending('payment-1', { expiryLedger: 400, transfer: { amount: 25n } });
  const result = await new OneTapBuy().start(shop, quote);
  assert.equal(result.kind, 'alreadyPaying');
  assert.deepEqual(shop.sponsored, []);
});

test('a second tap while buying is ignored and rolls its screen back with a message', async () => {
  const shop = new FakeShop();
  const buy = new OneTapBuy();
  const [first, second] = await Promise.all([buy.start(shop, quote), buy.start(shop, quote)]);
  assert.equal(first.kind, 'payment');
  assert.equal(second.kind, 'busy');
  assert.deepEqual(OneTapBuy.view(second, null), { kind: 'rollBack', message: OneTapBuy.busyMessage });
  assert.equal(shop.created.length, 1);
  assert.deepEqual(shop.sponsored, ['payment-1']);
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

test('a sent payment shows as confirming and is followed with its chain record', async () => {
  const shop = new FakeShop();
  const result = await new OneTapBuy().start(shop, quote);
  assert.deepEqual(OneTapBuy.view(result, null), {
    kind: 'show',
    shown: {
      order: shop.created[0],
      payment: { kind: 'confirming', txId: 'tx-payment-1', expiryLedger: 500 },
      follow: true,
      sent: { txId: 'tx-payment-1', expiryLedger: 500 },
    },
    celebrate: true,
  });
});

test('before a savings top-up, an expired order stops, a paid order is not paid again and an unpaid order goes ahead', () => {
  const unpaid = { status: 'unpaid', paymentStatus: 'unpaid' } as const;
  assert.deepEqual(OneTapBuy.beforeTopUp({ ...unpaid, status: 'expired' }), {
    state: { kind: 'priceExpired' },
    resumed: false,
  });
  assert.deepEqual(OneTapBuy.beforeTopUp({ ...unpaid, paymentCryptoTxId: 'tx-elsewhere' }), {
    state: { kind: 'confirming', txId: 'tx-elsewhere' },
    resumed: true,
    paidElsewhere: true,
  });
  assert.equal(OneTapBuy.beforeTopUp({ status: 'paid', paymentStatus: 'paid' })?.paidElsewhere, true);
  assert.equal(OneTapBuy.beforeTopUp(unpaid), null);
});

test('an order paid from elsewhere is followed with a notice and no celebration', () => {
  const order = giftCard(1, { paymentCryptoTxId: 'tx-elsewhere' });
  const outcome = OneTapBuy.beforeTopUp(order);
  assert.ok(outcome);
  assert.deepEqual(OneTapBuy.view({ kind: 'payment', order, outcome }, null), {
    kind: 'show',
    shown: { order, payment: outcome.state, follow: true, sent: { txId: 'tx-elsewhere', expiryLedger: undefined } },
    celebrate: false,
    notice: OneTapBuy.paidElsewhereMessage,
  });
});

test('a payment that was not sent rolls back with its reason or the not-bought message', () => {
  const order = giftCard(1);
  const notSent = (detail: string) =>
    OneTapBuy.view({ kind: 'payment', order, outcome: { state: { kind: 'notSent', detail }, resumed: false } }, null);
  assert.deepEqual(notSent('Not enough in your balance'), { kind: 'rollBack', message: 'Not enough in your balance' });
  assert.deepEqual(notSent(''), { kind: 'rollBack', message: OneTapBuy.notBoughtMessage });
  assert.deepEqual(
    OneTapBuy.view({ kind: 'payment', order, outcome: { state: { kind: 'failed' }, resumed: false } }, null),
    { kind: 'rollBack', message: OneTapBuy.notBoughtMessage },
  );
  assert.deepEqual(OneTapBuy.view({ kind: 'refused', order }, null), {
    kind: 'rollBack',
    message: OneTapBuy.notBoughtMessage,
  });
});

test('resuming with no order, or an unpaid order never sent, clears the screen', () => {
  assert.equal(OneTapBuy.resumed(null, null), null);
  assert.equal(OneTapBuy.resumed(giftCard(1), null), null);
});

test('resuming a held order that expired unsent shows its outcome without following it', () => {
  const order = giftCard(1, { status: 'expired', paymentStatus: 'expired' });
  assert.deepEqual(OneTapBuy.resumed(order, null), { order, payment: { kind: 'ready' }, follow: false, sent: null });
});

test('resuming a held order that was rejected shows it, not another order', () => {
  const order = giftCard(1, { status: 'rejected', paymentStatus: 'error' });
  assert.equal(OneTapBuy.resumed(order, null)?.order.id, 'order-1');
});

test('resuming an expired order with a sent payment keeps it confirming and checks the chain once more', () => {
  const order = giftCard(1, { status: 'expired', paymentStatus: 'expired' });
  const sent = { expiryLedger: 500 };
  assert.deepEqual(OneTapBuy.resumed(order, sent), {
    order,
    payment: { kind: 'confirming', txId: undefined, expiryLedger: 500 },
    follow: true,
    sent: { txId: undefined, expiryLedger: 500 },
  });
  assert.equal(OneTapBuy.checksChain(order), true);
});

test('resuming an order CTX marks paid follows it without a chain check', () => {
  const order = giftCard(1, { status: 'paid', paymentStatus: 'paid' });
  assert.deepEqual(OneTapBuy.resumed(order, { txId: 'tx' }), { order, payment: { kind: 'ready' }, follow: true, sent: null });
  assert.equal(OneTapBuy.checksChain(order), false);
});

test('the chain is checked for unpaid and unpaid-expired orders only', () => {
  assert.equal(OneTapBuy.checksChain({ status: 'unpaid', paymentStatus: 'unpaid' }), true);
  assert.equal(OneTapBuy.checksChain({ status: 'expired', paymentStatus: 'expired' }), true);
  assert.equal(OneTapBuy.checksChain({ status: 'expired', paymentStatus: 'paid' }), false);
  assert.equal(OneTapBuy.checksChain({ status: 'fulfilled', paymentStatus: 'paid' }), false);
});

test('a polled order merges its status and transaction id into the held order', () => {
  const held = giftCard(1);
  const polled = giftCard(1, { status: 'expired', paymentStatus: 'expired', paymentCryptoTxId: 'tx', cardFiatAmount: '99' });
  assert.deepEqual(OneTapBuy.merged(held, polled), {
    ...held,
    status: 'expired',
    paymentStatus: 'expired',
    paymentCryptoTxId: 'tx',
  });
  assert.equal(OneTapBuy.merged(held, giftCard(2, { status: 'paid' })), held);
  assert.equal(OneTapBuy.merged(null, polled), null);
});

test('a polled order without a transaction id keeps the held one', () => {
  const held = giftCard(1, { paymentCryptoTxId: 'tx' });
  assert.equal(OneTapBuy.merged(held, giftCard(1, { status: 'expired' }))?.paymentCryptoTxId, 'tx');
});

test('an already paying order shown after a sent record keeps its chain record', () => {
  const order = giftCard(1);
  const view = OneTapBuy.view({ kind: 'alreadyPaying', order }, { txId: 'tx', expiryLedger: 500 });
  assert.equal(view.kind === 'show' && view.shown.sent?.txId, 'tx');
  const paid = giftCard(1, { status: 'paid', paymentStatus: 'paid' });
  const paidView = OneTapBuy.view({ kind: 'alreadyPaying', order: paid }, null);
  assert.deepEqual(paidView, {
    kind: 'show',
    shown: { order: paid, payment: { kind: 'confirming' }, follow: true, sent: null },
    celebrate: false,
  });
});

test('a send with no transaction hash shows as confirming without celebrating', () => {
  const view = OneTapBuy.view(
    { kind: 'payment', order: giftCard(1), outcome: { state: { kind: 'confirming' }, resumed: false } },
    null,
  );
  assert.equal(view.kind === 'show' && view.celebrate, false);
});
