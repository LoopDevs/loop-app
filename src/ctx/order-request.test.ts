import assert from 'node:assert/strict';
import { test } from 'node:test';

import { OrderKeys, OrderRequest } from './order-request.ts';

const request = new OrderRequest({
  merchantId: 'm-1',
  fiatAmount: '25',
  fiatCurrency: 'USD',
  cryptoCurrency: 'XLM.USDC',
});

const card = { merchantId: 'm-1', cardFiatAmount: '25.00', cardFiatCurrency: 'USD' };
const askedAt = Date.parse('2026-10-31T12:00:00Z');

test('an order for the asked merchant, amount and currency matches', () => {
  assert.equal(request.matches(card), true);
  assert.equal(request.matches({ ...card, cardFiatCurrency: 'usd' }), true);
});

test('an order for another merchant does not match', () => {
  assert.equal(request.matches({ ...card, merchantId: 'm-2' }), false);
});

test('an order for another amount does not match', () => {
  assert.equal(request.matches({ ...card, cardFiatAmount: '250.00' }), false);
  assert.equal(request.matches({ ...card, cardFiatAmount: '' }), false);
});

test('an order in another currency does not match', () => {
  assert.equal(request.matches({ ...card, cardFiatCurrency: 'CAD' }), false);
});

test('a lowercase requested currency matches the uppercase order', () => {
  const lowercase = new OrderRequest({ ...request.asked, fiatCurrency: 'usd' });
  assert.equal(lowercase.matches(card), true);
});

const counted = () => {
  let made = 0;
  return new OrderKeys(
    () => `key-${(made += 1)}`,
    () => askedAt,
  );
};

test('a retried order for the same request reuses its idempotency key until an order is settled', () => {
  const keys = counted();
  assert.equal(keys.keyFor(request.asked), 'key-1');
  assert.equal(keys.keyFor({ ...request.asked }), 'key-1');
  keys.settle('key-1');
  assert.equal(keys.keyFor(request.asked), 'key-2');
});

test('an order for another merchant, amount or currency gets its own idempotency key', () => {
  const keys = counted();
  assert.equal(keys.keyFor(request.asked), 'key-1');
  assert.equal(keys.keyFor({ ...request.asked, merchantId: 'm-2' }), 'key-2');
  assert.equal(keys.keyFor({ ...request.asked, fiatAmount: '30' }), 'key-3');
  assert.equal(keys.keyFor({ ...request.asked, fiatCurrency: 'CAD' }), 'key-4');
  assert.equal(keys.keyFor({ ...request.asked, cryptoCurrency: 'XLM' }), 'key-5');
});

test('settling an earlier key keeps the key of the current request', () => {
  const keys = counted();
  keys.keyFor(request.asked);
  keys.keyFor({ ...request.asked, fiatAmount: '30' });
  keys.settle('key-1');
  assert.equal(keys.keyFor({ ...request.asked, fiatAmount: '30' }), 'key-2');
});

test('the request behind a pending key is known until the key is settled', () => {
  const keys = counted();
  const key = keys.keyFor(request.asked);
  assert.equal(keys.requestFor(key)?.askedAt, askedAt);
  assert.equal(keys.requestFor('other'), null);
  keys.settle(key);
  assert.equal(keys.requestFor(key), null);
});

test('a pending request older than its key lifetime gets a new key', () => {
  let now = askedAt;
  let made = 0;
  const keys = new OrderKeys(
    () => `key-${(made += 1)}`,
    () => now,
  );
  assert.equal(keys.keyFor(request.asked), 'key-1');
  now = askedAt + OrderKeys.pendingForMs;
  assert.equal(keys.keyFor(request.asked), 'key-1');
  now += 1;
  assert.equal(keys.keyFor(request.asked), 'key-2');
  assert.equal(keys.requestFor('key-2')?.askedAt, now);
});

const placedCard = {
  ...card,
  status: 'unpaid' as const,
  created: '2026-10-31T12:00:05Z',
  paymentMethod: 'crypto',
  paymentCryptoCurrency: 'XLM.USDC',
};

test('an unpaid matching card created since the request was asked was placed by it', () => {
  const asked = new OrderRequest(request.asked, askedAt);
  assert.equal(asked.placed(placedCard), true);
  assert.equal(asked.placed({ ...placedCard, created: '2026-10-31T11:56:00Z' }), true);
});

test('a card created before the request, allowing for clock skew, was not placed by it', () => {
  const asked = new OrderRequest(request.asked, askedAt);
  assert.equal(asked.placed({ ...placedCard, created: '2026-10-31T11:54:00Z' }), false);
  assert.equal(asked.placed({ ...placedCard, created: 'unknown' }), false);
});

test('a paid or differing card was not placed by the request', () => {
  const asked = new OrderRequest(request.asked, askedAt);
  assert.equal(asked.placed({ ...placedCard, status: 'paid' as const }), false);
  assert.equal(asked.placed({ ...placedCard, cardFiatAmount: '30.00' }), false);
});

test('a card on another payment rail was not placed by the request', () => {
  const bankCard = { ...placedCard, paymentMethod: 'plaid-uk-eu', paymentCryptoCurrency: undefined };
  const byWallet = new OrderRequest(request.asked, askedAt);
  assert.equal(byWallet.placed({ ...placedCard, paymentCryptoCurrency: 'XLM' }), false);
  assert.equal(byWallet.placed(bankCard), false);
  const byBank = new OrderRequest({ merchantId: 'm-1', fiatAmount: '25', fiatCurrency: 'USD' }, askedAt);
  assert.equal(byBank.placed(bankCard), true);
  assert.equal(byBank.placed(placedCard), false);
});
