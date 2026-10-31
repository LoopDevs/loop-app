import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loopLinks } from '../constants/loop-links.ts';
import type { GiftCard } from './client.ts';
import { orderHelp } from './order-help.ts';

const fulfilled: GiftCard = {
  id: 'g1',
  status: 'fulfilled',
  merchantId: 'm1',
  merchantName: 'Merchant & Co',
  created: '2026-01-02T12:00:00Z',
  cardFiatAmount: '25.00',
  cardFiatCurrency: 'USD',
  paymentId: 'p1',
  paymentStatus: 'paid',
  paymentMethod: 'crypto',
  number: '6006491234567890',
  pin: '4321',
  redeemUrl: 'https://redeem.example/secret-token',
  redeemUrlChallenge: 'challenge-9981',
  barcodeUrl: 'https://barcode.example/secret-barcode',
};

test('the mail draft is addressed to support with the order id as subject', () => {
  const draft = orderHelp.mailto(fulfilled);
  assert.ok(draft.startsWith(`mailto:${loopLinks.supportEmail}?`));
  const params = new URLSearchParams(draft.slice(draft.indexOf('?') + 1));
  assert.equal(params.get('subject'), 'Loop order g1');
});

test('the mail body lists merchant, amount, currency, status, date and order id', () => {
  const draft = orderHelp.mailto(fulfilled);
  const params = new URLSearchParams(draft.slice(draft.indexOf('?') + 1));
  const body = params.get('body') ?? '';
  assert.match(body, /Merchant: Merchant & Co/);
  assert.match(body, /Amount: 25\.00 USD/);
  assert.match(body, /Status: fulfilled/);
  assert.match(body, /Date: Jan 2, 2026/);
  assert.match(body, /Order id: g1/);
});

test('the mail draft never contains the number, PIN or any token-bearing URL', () => {
  const draft = decodeURIComponent(orderHelp.mailto(fulfilled));
  for (const secret of [
    fulfilled.number,
    fulfilled.pin,
    fulfilled.redeemUrl,
    fulfilled.redeemUrlChallenge,
    fulfilled.barcodeUrl,
  ]) {
    assert.ok(secret);
    assert.ok(!draft.includes(secret), secret);
  }
});

test('the mail body carries the payment transaction CTX recorded', () => {
  const body = orderHelp.body({ ...fulfilled, paymentCryptoTxId: 'ctx-tx' }, 'device-tx');
  assert.match(body, /Payment transaction: ctx-tx/);
  assert.doesNotMatch(body, /device-tx/);
});

test('the mail body carries the transaction this device sent when CTX has none', () => {
  assert.match(orderHelp.body(fulfilled, 'device-tx'), /Payment transaction: device-tx/);
  assert.doesNotMatch(orderHelp.body(fulfilled), /Payment transaction/);
});
