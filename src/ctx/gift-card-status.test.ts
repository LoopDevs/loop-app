import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { GiftCard } from './client.ts';
import { cashbackState, giftCardStatusLabel } from './gift-card-status.ts';

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
