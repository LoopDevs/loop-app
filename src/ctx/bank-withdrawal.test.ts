import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BankWithdrawalForm } from './bank-withdrawal.ts';
import type { BankWithdrawal } from './client.ts';

const now = Date.parse('2026-10-26T12:00:00Z');

const awaiting: BankWithdrawal = {
  id: 'bw_1',
  status: 'awaiting-payment',
  amount: '25.00',
  currency: 'XLM.GBPLOOP',
  fiatAmount: '25.00',
  fiatCurrency: 'GBP',
  accountName: 'Ada Lovelace',
  sortCode: '123456',
  accountNumberLast4: '5678',
  paymentId: 'pay_1',
  created: '2026-10-26T11:55:00Z',
  updated: '2026-10-26T11:55:00Z',
  paymentCryptoAmount: '25.0000000',
  paymentCryptoCurrency: 'XLM.GBPLOOP',
  paymentUrlExpiration: '2026-10-26T12:10:00Z',
};

test('max is the balance cut to whole pence', () => {
  assert.equal(BankWithdrawalForm.maxAmount(251_234_567n), '25.12');
});

test('zero and amounts above the balance are blocked', () => {
  assert.deepEqual(BankWithdrawalForm.checkAmount('0', 250_000_000n), { error: 'Enter an amount above zero' });
  assert.deepEqual(BankWithdrawalForm.checkAmount('25.01', 250_000_000n), {
    error: 'More than your GBPLOOP balance',
  });
  assert.deepEqual(BankWithdrawalForm.checkAmount('25.00', 250_000_000n), { amount: '25.00' });
});

test('sort code takes six digits with spaces or dashes', () => {
  assert.equal(BankWithdrawalForm.sortCode('12-34-56'), '123456');
  assert.equal(BankWithdrawalForm.sortCode('12 34 56'), '123456');
  assert.equal(BankWithdrawalForm.sortCode('12345'), null);
  assert.equal(BankWithdrawalForm.sortCode('12-34-5a'), null);
});

test('account number takes exactly eight digits', () => {
  assert.equal(BankWithdrawalForm.accountNumber(' 12345678 '), '12345678');
  assert.equal(BankWithdrawalForm.accountNumber('1234567'), null);
  assert.equal(BankWithdrawalForm.accountNumber('123456789'), null);
  assert.equal(BankWithdrawalForm.bankDetails('12-34-56', 'abcdefgh'), null);
});

test('review names the amount, payee and masked account', () => {
  const text = BankWithdrawalForm.reviewText('25.00', { sortCode: '123456', accountNumber: '12345678' }, 'Ada Lovelace');
  assert.match(text, /25\.00 GBPLOOP/);
  assert.match(text, /£25\.00 to Ada Lovelace, 12-34-56 ••••5678, after a review\./);
});

test('a withdrawal matches only the confirmed GBPLOOP amount', () => {
  assert.equal(BankWithdrawalForm.matchesConfirmed(awaiting, '25.00'), true);
  assert.equal(BankWithdrawalForm.matchesConfirmed(awaiting, '24.99'), false);
  assert.equal(BankWithdrawalForm.matchesConfirmed({ ...awaiting, paymentCryptoAmount: '30' }, '25.00'), false);
  assert.equal(BankWithdrawalForm.matchesConfirmed({ ...awaiting, paymentCryptoCurrency: 'XLM.USDC' }, '25.00'), false);
  assert.equal(BankWithdrawalForm.matchesConfirmed({ ...awaiting, currency: 'XLM.USDC' }, '25.00'), false);
  assert.equal(BankWithdrawalForm.matchesConfirmed({ ...awaiting, paymentCryptoAmount: undefined }, '25.00'), false);
});

test('finish is offered only before the payment window closes', () => {
  assert.deepEqual(BankWithdrawalForm.status(awaiting, now), { lines: ['Waiting for payment'], canFinish: true });
  assert.deepEqual(BankWithdrawalForm.status(awaiting, Date.parse('2026-10-26T12:10:00Z')), {
    lines: ['Closing. You can start a new withdrawal in a few minutes.'],
    canFinish: false,
  });
});

test('each later status has its own copy', () => {
  const lines = (patch: Partial<BankWithdrawal>) => BankWithdrawalForm.status({ ...awaiting, ...patch }, now).lines;
  assert.deepEqual(lines({ status: 'in-review' }), ['In review']);
  assert.deepEqual(lines({ status: 'paying' }), ['Sending to your bank']);
  assert.deepEqual(lines({ status: 'paid', bankReference: 'LOOP123' }), ['Paid', 'Reference LOOP123']);
  assert.deepEqual(lines({ status: 'rejected', reason: 'Name mismatch' }), ['Not approved', 'Name mismatch']);
  assert.deepEqual(lines({ status: 'expired' }), ['Expired']);
});

test('an unknown status reads as in progress', () => {
  const status = 'settling' as BankWithdrawal['status'];
  assert.deepEqual(BankWithdrawalForm.status({ ...awaiting, status }, now), {
    lines: ['In progress'],
    canFinish: false,
  });
});
