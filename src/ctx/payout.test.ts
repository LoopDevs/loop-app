import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { PayoutJson } from './client.ts';
import { Payout, payoutStatuses, type PayoutStatus } from './payout.ts';

const reserved: PayoutJson = {
  id: 'p1',
  kind: 'savings',
  status: 'pending',
  currency: 'XLM.USDC',
  amount: '1.5',
  reservationTransferId: 't1',
};

const inFlightStatuses: PayoutStatus[] = [
  'pending-approval',
  'approved',
  'held',
  'pending',
  'submitted',
  'queued',
  'failed',
];

test('every non-terminal status with a live reservation is in flight', () => {
  for (const status of payoutStatuses) {
    const payout = new Payout({ ...reserved, status });
    assert.equal(payout.isInFlight(), inFlightStatuses.includes(status), status);
  }
});

test('a reversed payout is never in flight', () => {
  for (const status of payoutStatuses) {
    const payout = new Payout({ ...reserved, status, reversalTransferId: 't2' });
    assert.equal(payout.isInFlight(), false, status);
  }
});

test('a payout without a reservation is not in flight', () => {
  const payout = new Payout({ ...reserved, reservationTransferId: undefined });
  assert.equal(payout.isInFlight(), false);
});

test('only queued reads retrying and only failed reads delayed', () => {
  for (const status of payoutStatuses) {
    for (const reversalTransferId of [undefined, 't2']) {
      const label = new Payout({ ...reserved, status, reversalTransferId }).statusLabel();
      const expected =
        status === 'queued' ? 'retrying' : status === 'failed' ? 'delayed, contact support' : 'on the way';
      assert.equal(label, expected, status);
    }
  }
});

test('the destination follows the payout kind', () => {
  assert.equal(new Payout(reserved).destinationLabel(), 'to savings');
  assert.equal(new Payout({ ...reserved, kind: 'wallet' }).destinationLabel(), 'to wallet');
  assert.equal(new Payout({ ...reserved, kind: undefined }).destinationLabel(), 'to wallet');
});
