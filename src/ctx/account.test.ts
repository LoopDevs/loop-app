import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Account } from './account.ts';
import type { AccountJson } from './client.ts';
import type { PayoutJson } from './payout.ts';

function payout(overrides: Partial<PayoutJson>): PayoutJson {
  return {
    id: 'p1',
    kind: 'savings',
    status: 'pending',
    currency: 'XLM.USDC',
    amount: '2',
    reservationTransferId: 't1',
    ...overrides,
  };
}

test('a reserved, unreversed failed payout means cashback is delayed', () => {
  assert.equal(new Account({ wallet: [], payouts: [payout({ status: 'failed' })] }).hasDelayedCashback(), true);
});

test('a payout that has not failed, or a failed one that was reversed or never reserved, is not a delay', () => {
  for (const status of ['pending', 'submitted', 'queued', 'complete', 'cancelled'] as const) {
    assert.equal(new Account({ wallet: [], payouts: [payout({ status })] }).hasDelayedCashback(), false, status);
  }
  const reversed = payout({ status: 'failed', reversalTransferId: 'r1' });
  const unreserved = payout({ status: 'failed', reservationTransferId: undefined });
  assert.equal(new Account({ wallet: [], payouts: [reversed, unreserved] }).hasDelayedCashback(), false);
});

test('a missing wallet and payout list reads as empty', () => {
  const account = new Account({} as AccountJson);
  assert.deepEqual(account.wallet, []);
  assert.deepEqual(account.payouts, []);
  assert.equal(account.hasDelayedCashback(), false);
});
