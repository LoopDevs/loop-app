import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { GiftCard } from './client.ts';
import { cashbackState, giftCardStatusLabel, isHiddenFromHistory, outcomeText } from './gift-card-status.ts';

test('every gift card status has a plain label', () => {
  assert.equal(giftCardStatusLabel('unpaid'), 'Waiting for payment');
  assert.equal(giftCardStatusLabel('paid'), 'Processing');
  assert.equal(giftCardStatusLabel('fulfilled'), 'Ready');
  assert.equal(giftCardStatusLabel('rejected'), 'Failed');
  assert.equal(giftCardStatusLabel('refunded'), 'Refunded');
  assert.equal(giftCardStatusLabel('expired'), 'Expired');
});

const card = (fields: Partial<GiftCard>): GiftCard => ({
  id: 'g1',
  status: 'fulfilled',
  merchantId: 'm1',
  merchantName: 'Merchant',
  created: '2026-01-01T00:00:00Z',
  cardFiatAmount: '25.00',
  cardFiatCurrency: 'USD',
  paymentId: 'p1',
  paymentStatus: 'paid',
  paymentMethod: 'crypto',
  ...fields,
});

test('a card without a cashback amount has no cashback', () => {
  assert.equal(cashbackState(card({ cashbackCredited: true })), 'none');
});

test('reversed wins over credited', () => {
  assert.equal(cashbackState(card({ cashbackAmount: '1', cashbackCredited: true, cashbackReversed: true })), 'reversed');
});

test('credited cashback is credited', () => {
  assert.equal(cashbackState(card({ cashbackAmount: '1', cashbackCredited: true })), 'credited');
});

test('paid and fulfilled cards with neither flag are pending', () => {
  assert.equal(cashbackState(card({ cashbackAmount: '1', status: 'paid' })), 'pending');
  assert.equal(cashbackState(card({ cashbackAmount: '1', status: 'fulfilled' })), 'pending');
});

test('closed cards with neither flag have no cashback', () => {
  for (const status of ['rejected', 'refunded', 'expired'] as const) {
    assert.equal(cashbackState(card({ cashbackAmount: '1', status })), 'none');
  }
});

const txId = 'tx1';
const refundLine = 'contact support about a refund.';

test('a refunded card says the payment was refunded', () => {
  assert.equal(outcomeText(card({ status: 'refunded', paymentStatus: 'refunded' })), 'Your payment was refunded.');
});

test('a rejected card CTX marks paid says to contact support, whatever the method', () => {
  const expected = "This card couldn't be issued. Contact support about a refund.";
  assert.equal(outcomeText(card({ status: 'rejected', paymentStatus: 'paid' })), expected);
  assert.equal(outcomeText(card({ status: 'rejected', paymentStatus: 'paid', paymentCryptoTxId: txId })), expected);
  assert.equal(
    outcomeText(card({ status: 'rejected', paymentStatus: 'paid', paymentMethod: 'plaid-uk-eu' })),
    expected,
  );
});

test('a rejected crypto card with a sent transfer hedges about being charged', () => {
  assert.equal(
    outcomeText(card({ status: 'rejected', paymentStatus: 'cancelled', paymentCryptoTxId: txId })),
    `This card couldn't be issued. If you were charged, ${refundLine}`,
  );
});

test('an expired card with a sent transfer or a bank payment hedges about being charged', () => {
  const expected = `This order expired. If you were charged, ${refundLine}`;
  assert.equal(outcomeText(card({ status: 'expired', paymentStatus: 'expired', paymentCryptoTxId: txId })), expected);
  assert.equal(
    outcomeText(card({ status: 'expired', paymentStatus: 'expired', paymentMethod: 'plaid-uk-eu' })),
    expected,
  );
});

test('a cancelled card hedges about being charged, with or without a transfer', () => {
  const expected = `This order was cancelled. If you were charged, ${refundLine}`;
  assert.equal(outcomeText(card({ status: 'rejected', paymentStatus: 'cancelled' })), expected);
  assert.equal(
    outcomeText(card({ status: 'rejected', paymentStatus: 'cancelled', paymentMethod: 'plaid-uk-eu' })),
    expected,
  );
});

test('only a payment error or an unsent crypto expiry says the user was not charged', () => {
  const expected = "This order didn't go through. You weren't charged.";
  assert.equal(outcomeText(card({ status: 'rejected', paymentStatus: 'error' })), expected);
  assert.equal(outcomeText(card({ status: 'expired', paymentStatus: 'expired' })), expected);
});

test('an order that expired after payment says to contact support', () => {
  assert.equal(
    outcomeText(card({ status: 'expired', paymentStatus: 'paid' })),
    'This order expired after payment. Contact support about a refund.',
  );
});

test('unpaid orders are hidden from history', () => {
  assert.equal(isHiddenFromHistory(card({ status: 'unpaid', paymentStatus: 'unpaid' })), true);
});

test('an expired order that was never charged is hidden from history', () => {
  assert.equal(isHiddenFromHistory(card({ status: 'expired', paymentStatus: 'expired' })), true);
});

test('an expired order that was paid or sent is shown in history', () => {
  assert.equal(isHiddenFromHistory(card({ status: 'expired', paymentStatus: 'paid' })), false);
  assert.equal(
    isHiddenFromHistory(card({ status: 'expired', paymentStatus: 'expired', paymentCryptoTxId: txId })),
    false,
  );
  assert.equal(
    isHiddenFromHistory(card({ status: 'expired', paymentStatus: 'expired', paymentMethod: 'plaid-uk-eu' })),
    false,
  );
});

test('fulfilled orders are shown in history', () => {
  assert.equal(isHiddenFromHistory(card({ status: 'fulfilled' })), false);
});

test('open and fulfilled cards have no outcome text', () => {
  assert.equal(outcomeText(card({ status: 'fulfilled' })), null);
  assert.equal(outcomeText(card({ status: 'paid' })), null);
  assert.equal(outcomeText(card({ status: 'unpaid', paymentStatus: 'unpaid' })), null);
});

test('a card CTX marks paid is never described as not charged or possibly charged', () => {
  for (const status of ['unpaid', 'paid', 'fulfilled', 'rejected', 'refunded', 'expired'] as const) {
    const text = outcomeText(card({ status, paymentStatus: 'paid' })) ?? '';
    assert.ok(!text.includes("weren't charged"));
    assert.ok(!text.includes('If you were charged'));
  }
});
