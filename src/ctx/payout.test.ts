import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Payout } from './payout.ts';

const statuses = [
  'pending-approval',
  'approved',
  'held',
  'pending',
  'submitted',
  'queued',
  'complete',
  'failed',
  'rejected',
  'cancelled',
];

function payout(status: string, transfers: { reservationTransferId?: string; reversalTransferId?: string }): Payout {
  return new Payout({ id: 'p1', status, currency: 'XLM.USDC', amount: '1', ...transfers });
}

test('a reserved, unreversed payout is in flight until it reaches a terminal status', () => {
  for (const status of statuses) {
    const expected = !Payout.terminalStatuses.includes(status);
    assert.equal(payout(status, { reservationTransferId: 't1' }).isInFlight(), expected, status);
  }
});

test('a payout with no reservation or with a reversal is not in flight', () => {
  for (const status of statuses) {
    assert.equal(payout(status, {}).isInFlight(), false, status);
    assert.equal(payout(status, { reservationTransferId: 't1', reversalTransferId: 'r1' }).isInFlight(), false, status);
  }
});
