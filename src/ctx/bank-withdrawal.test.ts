import assert from 'node:assert/strict';
import { test } from 'node:test';

import { units } from '../stellar/units.ts';
import { BankWithdrawal, bankWithdrawalStatuses, type BankWithdrawalJson } from './bank-withdrawal.ts';

const json: BankWithdrawalJson = {
  id: 'w1',
  status: 'awaiting-payment',
  amount: '25',
  currency: 'XLM.GBPLOOP',
  accountName: 'Sam Smith',
  sortCode: '112233',
  accountNumberLast4: '5678',
  paymentId: 'p1',
  created: '2026-11-17T11:59:00Z',
  paymentUrlExpiration: '2026-11-17T12:09:00Z',
};

const plenty = units.parse('5000');

test('an amount is accepted in whole pence between the smallest and the largest cash out', () => {
  assert.equal(BankWithdrawal.amountOf('10', plenty), units.parse('10'));
  assert.equal(BankWithdrawal.amountOf('25,50', plenty), units.parse('25.5'));
  assert.equal(BankWithdrawal.amountOf('1000', plenty), units.parse('1000'));
  assert.equal(BankWithdrawal.amountOf('9.99', plenty), null);
  assert.equal(BankWithdrawal.amountOf('1000.01', plenty), null);
  assert.equal(BankWithdrawal.amountOf('25.505', plenty), null);
  assert.equal(BankWithdrawal.amountOf('abc', plenty), null);
});

test('an amount above what the account holds is refused', () => {
  const held = units.parse('40.129');
  assert.equal(BankWithdrawal.largestFor(held), units.parse('40.12'));
  assert.equal(BankWithdrawal.amountOf('40.12', held), units.parse('40.12'));
  assert.equal(BankWithdrawal.amountOf('40.13', held), null);
  assert.equal(BankWithdrawal.amountOf('10', units.parse('9.99')), null);
});

test('a request carries the amount in pounds and pence', () => {
  assert.deepEqual(BankWithdrawal.request(units.parse('25.5'), '112233', '12345678'), {
    currency: 'XLM.GBPLOOP',
    amount: '25.50',
    sortCode: '112233',
    accountNumber: '12345678',
  });
});

test('bank details are digits of a set length', () => {
  assert.equal(BankWithdrawal.digits('11-22 33x9', BankWithdrawal.sortCodeLength), '112233');
  assert.equal(BankWithdrawal.shownSortCode('112233'), '11-22-33');
  assert.equal(BankWithdrawal.accountReady('112233', '12345678'), true);
  assert.equal(BankWithdrawal.accountReady('11223', '12345678'), false);
  assert.equal(BankWithdrawal.accountReady('112233', '1234567'), false);
});

test('a withdrawal answers only the request it was made for', () => {
  const request = BankWithdrawal.request(units.parse('25'), '112233', '12345678');
  assert.equal(new BankWithdrawal(json).answers(request), true);
  assert.equal(new BankWithdrawal({ ...json, amount: '25.01' }).answers(request), false);
  assert.equal(new BankWithdrawal({ ...json, sortCode: '112234' }).answers(request), false);
  assert.equal(new BankWithdrawal({ ...json, accountNumberLast4: '5679' }).answers(request), false);
  assert.equal(new BankWithdrawal({ ...json, currency: 'XLM.USDC' }).answers(request), false);
  assert.equal(new BankWithdrawal({ ...json, status: 'in-review' }).answers(request), false);
});

test('the pay window comes from the payment expiry', () => {
  assert.equal(new BankWithdrawal(json).payWindow()?.expiresAt, Date.parse('2026-11-17T12:09:00Z'));
  assert.equal(new BankWithdrawal({ ...json, paymentUrlExpiration: undefined }).payWindow(), null);
  assert.equal(new BankWithdrawal({ ...json, paymentUrlExpiration: 'soon' }).payWindow(), null);
});

test('every status has progress wording, with tracker steps only on the paying path', () => {
  const stepByStatus: Record<BankWithdrawalJson['status'], number | null> = {
    'awaiting-payment': 0,
    'in-review': 1,
    paying: 2,
    burning: 2,
    paid: 3,
    rejected: null,
    returning: null,
    returned: null,
    expired: null,
  };
  for (const status of bankWithdrawalStatuses) {
    const progress = new BankWithdrawal({ ...json, status }).progress('£25.00');
    assert.equal(progress.step, stepByStatus[status]);
    assert.ok(progress.headline.length > 0 && progress.detail.length > 0);
  }
});

test('a withdrawal is settled once it is paid, returned or expired, and only paid or returned is final', () => {
  const settled = bankWithdrawalStatuses.filter((status) => new BankWithdrawal({ ...json, status }).isSettled());
  assert.deepEqual(settled, ['expired', 'paid', 'returned']);
  const final = bankWithdrawalStatuses.filter((status) => new BankWithdrawal({ ...json, status }).isFinal());
  assert.deepEqual(final, ['paid', 'returned']);
});
