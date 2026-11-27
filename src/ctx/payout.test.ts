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

const inFlightByStatus: Record<PayoutJson['status'], boolean> = {
  'pending-approval': true,
  approved: true,
  held: true,
  pending: true,
  submitted: true,
  queued: true,
  failed: true,
  complete: false,
  rejected: false,
  cancelled: false,
};

test('every status the app knows has an expected in-flight answer', () => {
  assert.deepEqual(Object.keys(inFlightByStatus).sort(), [...payoutStatuses].sort());
});

test('a reserved, unreversed payout is in flight until it is complete, rejected or cancelled', () => {
  for (const [status, expected] of Object.entries(inFlightByStatus)) {
    const payout = new Payout({ ...reserved, status: status as PayoutJson['status'] });
    assert.equal(payout.isInFlight(), expected, status);
  }
});

test('a payout with a status the app does not know is not in flight', () => {
  for (const status of ['settled', '', 'PENDING', 'toString', '__proto__']) {
    const payout = new Payout({ ...reserved, status: status as PayoutJson['status'] });
    assert.equal(payout.isInFlight(), false, status);
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
    for (const reservationTransferId of [undefined, '']) {
      const payout = new Payout({ ...reserved, status, reservationTransferId });
      assert.equal(payout.isInFlight(), false, `${status} ${JSON.stringify(reservationTransferId)}`);
    }
  }
});

test('an empty reversal id does not count as a reversal', () => {
  assert.equal(new Payout({ ...reserved, reversalTransferId: '' }).isInFlight(), true);
});

test('the net amount is what CTX sent, or the full amount until then', () => {
  assert.equal(new Payout({ ...reserved, amount: '5.0000000', sentAmount: '4.9700000' }).netAmount(), '4.9700000');
  assert.equal(new Payout({ ...reserved, amount: '5.0000000' }).netAmount(), '5.0000000');
  assert.equal(new Payout({ ...reserved, amount: '5.0000000', sentAmount: '0' }).netAmount(), '0');
});

test('a payout keeps the kind a missing kind defaults to', () => {
  assert.equal(new Payout({ ...reserved, kind: undefined }).kind, 'wallet');
  assert.equal(new Payout(reserved).kind, 'savings');
});
