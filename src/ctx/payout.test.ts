import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Payout, payoutStatuses, type PayoutJson } from './payout.ts';

const reserved: PayoutJson = {
  id: 'p1',
  kind: 'savings',
  status: 'pending',
  currency: 'XLM.USDC',
  amount: '1.5',
  reservationTransferId: 't1',
};

test('a reserved, unreversed payout is in flight until it reaches a terminal status', () => {
  for (const status of payoutStatuses) {
    const payout = new Payout({ ...reserved, status });
    assert.equal(payout.isInFlight(), !Payout.terminalStatuses.includes(status), status);
  }
});

test('a reversed payout is never in flight', () => {
  for (const status of payoutStatuses) {
    const payout = new Payout({ ...reserved, status, reversalTransferId: 't2' });
    assert.equal(payout.isInFlight(), false, status);
  }
});

test('a payout without a reservation is not in flight', () => {
  for (const status of payoutStatuses) {
    const payout = new Payout({ ...reserved, status, reservationTransferId: undefined });
    assert.equal(payout.isInFlight(), false, status);
  }
});

test('only queued reads retrying and only failed reads delayed', () => {
  for (const status of payoutStatuses) {
    const label = new Payout({ ...reserved, status }).statusLabel();
    const expected =
      status === 'queued' ? 'retrying' : status === 'failed' ? 'delayed, contact support' : 'on the way';
    assert.equal(label, expected, status);
  }
});

test('the destination follows the payout kind', () => {
  assert.equal(new Payout(reserved).destinationLabel(), 'to savings');
  assert.equal(new Payout({ ...reserved, kind: 'wallet' }).destinationLabel(), 'to wallet');
  assert.equal(new Payout({ ...reserved, kind: undefined }).destinationLabel(), 'to wallet');
});
