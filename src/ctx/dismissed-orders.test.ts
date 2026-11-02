import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { GiftCard } from './client.ts';
import { DismissedOrders } from './dismissed-orders.ts';

const order = (fields: Partial<GiftCard> = {}): GiftCard => ({
  id: 'g1',
  status: 'unpaid',
  merchantId: 'm1',
  merchantName: 'Merchant',
  created: '2026-11-02T11:59:00Z',
  cardFiatAmount: '25.00',
  cardFiatCurrency: 'GBP',
  paymentId: 'p1',
  paymentStatus: 'unpaid',
  paymentMethod: 'plaid-uk-eu',
  ...fields,
});

const memoryStorage = (initial: Record<string, string> = {}) => {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: async (key: string) => items.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      items.set(key, value);
    },
  };
};

test('a dismissed unpaid order with no payment started is hidden', async () => {
  const store = new DismissedOrders(memoryStorage());
  await store.dismiss(order());
  assert.equal(DismissedOrders.hidden(order(), await store.load()), true);
  assert.equal(DismissedOrders.hidden(order({ id: 'g2' }), await store.load()), false);
});

test('a dismissed order shows again once money is on it', async () => {
  const store = new DismissedOrders(memoryStorage());
  await store.dismiss(order());
  const ids = await store.load();
  assert.equal(DismissedOrders.hidden(order({ paymentStatus: 'paid' }), ids), false);
  assert.equal(DismissedOrders.hidden(order({ status: 'paid' }), ids), false);
  assert.equal(DismissedOrders.hidden(order({ status: 'fulfilled' }), ids), false);
  assert.equal(DismissedOrders.hidden(order({ paymentCryptoTxId: 'tx1' }), ids), false);
});

test('dismissed ids persist, dedupe and keep only the newest', async () => {
  const storage = memoryStorage();
  const store = new DismissedOrders(storage);
  for (let index = 0; index < DismissedOrders.keep + 5; index += 1) {
    await store.dismiss(order({ id: `g${index}` }));
  }
  await store.dismiss(order({ id: 'g7' }));
  const saved = DismissedOrders.parse(storage.items.get(DismissedOrders.key) ?? null);
  assert.equal(saved.length, DismissedOrders.keep);
  assert.equal(saved.at(-1), 'g7');
  assert.equal(saved.includes('g0'), false);
  const reloaded = new DismissedOrders(storage);
  assert.equal((await reloaded.load()).has('g7'), true);
});

test('unreadable storage counts as nothing dismissed', async () => {
  const store = new DismissedOrders(memoryStorage({ [DismissedOrders.key]: '{broken' }));
  assert.equal((await store.load()).size, 0);
  assert.deepEqual(DismissedOrders.parse('[1, "g1", null]'), ['g1']);
});
