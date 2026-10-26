import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Account } from './account.ts';
import type { AccountJson, CashbackDestination } from './client.ts';
import type { PayoutJson } from './payout.ts';
import { Profile } from './profile.ts';

function profile(stableCurrency: string, cashbackDestination: CashbackDestination): Profile {
  return Profile.fromMe({ user: { id: 'u1', stableCurrency, cashbackDestination } });
}

const saver = profile('XLM.USDC', 'savings');
const nonSaver = profile('XLM.USDC', 'account');

function payout(overrides: Partial<PayoutJson>): PayoutJson {
  return {
    id: 'p1',
    kind: 'wallet',
    status: 'pending',
    currency: 'XLM.USDC',
    amount: '2',
    reservationTransferId: 't1',
    ...overrides,
  };
}

function labels(json: AccountJson, routing: Profile): string[] {
  return new Account(json).onTheWay(routing).map((item) => `${item.currency} ${item.label}`);
}

test("a non-saver's balance waits for payout", () => {
  assert.deepEqual(labels({ wallet: [{ currency: 'XLM.USDC', amount: '1.5' }], payouts: [] }, nonSaver), [
    'XLM.USDC waiting for payout',
  ]);
});

test('zero balances are not listed', () => {
  const json = { wallet: [{ currency: 'XLM.USDC', amount: '0' }, { currency: 'XLM', amount: '0.0000000' }], payouts: [] };
  assert.deepEqual(labels(json, nonSaver), []);
});

test('an XLM balance waits to convert whatever the destination', () => {
  const json = { wallet: [{ currency: 'XLM', amount: '3' }], payouts: [] };
  for (const routing of [saver, nonSaver]) {
    assert.deepEqual(labels(json, routing), ['XLM converts to XLM.USDC when a conversion is available']);
  }
});

test("a saver's balance goes to savings when savings takes it and is held otherwise", () => {
  const items = new Account({
    wallet: [
      { currency: 'XLM.USDC', amount: '1' },
      { currency: 'XLM.GBPLOOP', amount: '1' },
    ],
    payouts: [],
  }).onTheWay(profile('XLM.GBPLOOP', 'savings'));
  assert.deepEqual(
    items.map((item) => [item.label, item.heldBySavings]),
    [
      ['goes to savings when savings is available', false],
      ['held: Loop savings holds XLM.USDC, switch to Account to receive it', true],
    ],
  );
});

test('a balance with a failed payout in its currency reads delayed', () => {
  const json = {
    wallet: [{ currency: 'XLM.USDC', amount: '1' }],
    payouts: [payout({ status: 'failed' })],
  };
  for (const routing of [saver, nonSaver]) {
    assert.deepEqual(
      new Account(json).onTheWay(routing).map((item) => [item.key, item.label]),
      [
        ['balance:XLM.USDC', 'delayed, contact support'],
        ['payout:p1', 'delayed, contact support'],
      ],
    );
  }
});

test('a queued savings payout is listed as retrying to savings', () => {
  const items = new Account({ wallet: [], payouts: [payout({ kind: 'savings', status: 'queued' })] }).onTheWay(saver);
  assert.deepEqual(
    items.map((item) => [item.destination, item.label]),
    [['to savings', 'retrying']],
  );
});

test('an in-flight payout lists what CTX sends after the network fee', () => {
  const json = { wallet: [], payouts: [payout({ amount: '5.0000000', sentAmount: '4.9700000' })] };
  assert.deepEqual(
    new Account(json).onTheWay(nonSaver).map((item) => item.amount),
    ['4.9700000'],
  );
});

test('an in-flight payout without a sent amount lists its full amount', () => {
  const json = { wallet: [], payouts: [payout({ amount: '5.0000000' })] };
  assert.deepEqual(
    new Account(json).onTheWay(nonSaver).map((item) => item.amount),
    ['5.0000000'],
  );
});

test('complete and reversed payouts are not listed', () => {
  const json = {
    wallet: [],
    payouts: [
      payout({ status: 'complete' }),
      payout({ id: 'p2', status: 'cancelled', reversalTransferId: 't2' }),
      payout({ id: 'p3', status: 'rejected', reversalTransferId: 't3' }),
    ],
  };
  assert.deepEqual(labels(json, nonSaver), []);
});

test('an unreversed failed payout is listed as delayed', () => {
  assert.deepEqual(labels({ wallet: [], payouts: [payout({ status: 'failed' })] }, nonSaver), [
    'XLM.USDC delayed, contact support',
  ]);
});

test('a missing wallet and payout list reads as empty', () => {
  assert.deepEqual(labels({ wallet: null, payouts: null }, nonSaver), []);
});
