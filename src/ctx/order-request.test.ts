import assert from 'node:assert/strict';
import { test } from 'node:test';

import { OrderRequest } from './order-request.ts';

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

test('require passes a matching order through and refuses a mismatch', () => {
  assert.equal(request.require(card), card);
  assert.throws(() => request.require({ ...card, merchantId: 'm-2' }), /didn't match/);
});
