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
  return new OrderKeys(() => `key-${(made += 1)}`);
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
