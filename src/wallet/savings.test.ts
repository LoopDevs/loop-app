import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CtxError } from '../ctx/ctx-error.ts';
import { money } from '../money.ts';
import { units } from '../stellar/units.ts';
import { Savings, UnansweredDeposit } from './savings.ts';
import { VaultCall, type SentVaultCall } from './vault-call.ts';

test('savings takes every currency with a vault', () => {
  assert.ok(Savings.currencies.includes('XLM.USDC'));
  for (const currency of Savings.currencies) {
    assert.equal(Savings.takes(currency), true, currency);
    assert.match(Savings.vault(currency), /^C[A-Z2-7]{55}$/);
  }
});

test('savings takes no other currency', () => {
  for (const currency of ['XLM.EURC', 'XLM', '', undefined]) {
    assert.equal(Savings.takes(currency), false, String(currency));
  }
  assert.throws(() => Savings.vault('XLM.EURC'), /no vault for XLM\.EURC/);
});

test('deposits go into a currency that has a vault', () => {
  assert.equal(Savings.takes(Savings.depositCurrency), true);
});

test('the deposit intent carries the exact seven-decimal amount', () => {
  const max = units.parse('12.3456789');
  assert.equal(Savings.depositAmount(units.format(max, units.decimals), max), max);
  assert.deepEqual(Savings.depositIntent('XLM.USDC', max), {
    intent: 'vault_deposit',
    currency: 'XLM.USDC',
    amount: '12.3456789',
  });
  assert.equal(Savings.depositIntent('XLM.USDC', units.parse('1')).amount, '1.0000000');
});

test('a deposit amount must be above zero and within the wallet balance', () => {
  const inWallet = units.parse('5');
  assert.equal(Savings.depositAmount('5', inWallet), inWallet);
  assert.equal(Savings.depositAmount('2,5', inWallet), units.parse('2.5'));
  assert.equal(Savings.depositAmount('0', inWallet), null);
  assert.equal(Savings.depositAmount('', inWallet), null);
  assert.equal(Savings.depositAmount('abc', inWallet), null);
  assert.equal(Savings.depositAmount('-1', inWallet), null);
  assert.equal(Savings.depositAmount('1.12345678', inWallet), null);
  assert.equal(Savings.depositAmount('5.0000001', inWallet), null);
});

test('Max shows two decimals without rounding up and deposits the balance captured at the tap', () => {
  const balance = units.parse('12.3456789');
  assert.equal(Savings.maxInput(balance), '12.34');
  assert.equal(Savings.depositAmount('12.34', balance, balance), balance);
  assert.equal(Savings.depositAmount('12.34', balance), units.parse('12.34'));
  assert.equal(Savings.depositAmount('12.34', balance + units.parse('50'), balance), balance);
  assert.equal(Savings.depositAmount('12.34', balance - 1n, balance), null);
});

test('Max needs at least one cent, so the field never shows 0.00 for an amount that is signed', () => {
  assert.equal(Savings.canMax(Savings.oneCent), true);
  assert.equal(Savings.canMax(Savings.oneCent - 1n), false);
  assert.equal(Savings.canMax(0n), false);
  assert.equal(Savings.maxInput(Savings.oneCent - 1n), '0.00');
  assert.equal(Savings.depositAmount('0.00', Savings.oneCent - 1n, Savings.oneCent - 1n), null);
  assert.equal(Savings.depositAmount('', 0n, 0n), null);
});

test('each deposit outcome has its own message', () => {
  const amount = units.parse('25');
  assert.equal(
    Savings.depositMessage('success', 'XLM.USDC', amount),
    `Added ${money.token(amount, 'XLM.USDC')} to savings`,
  );
  assert.equal(Savings.depositMessage('failed', 'XLM.USDC', amount), Savings.depositFailedMessage);
  assert.equal(Savings.depositMessage('pending', 'XLM.USDC', amount), Savings.depositPendingMessage);
  assert.equal(Savings.depositMessage('unconfirmed', 'XLM.USDC', amount), Savings.depositUnconfirmedMessage);
});

function depositRun(send: () => Promise<SentVaultCall>) {
  const events: string[] = [];
  const vaultCall = new VaultCall({
    transaction: async () => ({ status: 'SUCCESS', latestLedger: 1 }),
    latestLedger: async () => 1,
    sleep: async () => {},
    now: () => 0,
  });
  const result = Savings.sendDeposit(send, vaultCall, {
    clear: () => events.push('clear'),
    restore: () => events.push('restore'),
  });
  return { result, events };
}

test('a deposit refused before it is sent keeps the amount in the field', async () => {
  const { result, events } = depositRun(async () => {
    throw new CtxError(400, '{"error":"ErrSavingsUnavailable"}');
  });
  await assert.rejects(result, /Savings isn't available/);
  assert.deepEqual(events, []);
});

test('a deposit the sponsor accepts clears the field and keeps it clear once it lands', async () => {
  const { result, events } = depositRun(async () => ({ hash: 'HASH', status: 'pending', expiryLedger: 10 }));
  assert.equal(await result, 'success');
  assert.deepEqual(events, ['clear']);
});

test('a deposit that fails after it is sent puts the amount back in the field', async () => {
  const { result, events } = depositRun(async () => ({ hash: '', status: 'failed', expiryLedger: 10 }));
  assert.equal(await result, 'failed');
  assert.deepEqual(events, ['clear', 'restore']);
});

test('an unanswered deposit clears the field and reports the deposit as unconfirmed', async () => {
  const { result, events } = depositRun(async () => {
    throw new UnansweredDeposit(new TypeError('Network request failed'));
  });
  assert.equal(await result, 'unconfirmed');
  assert.deepEqual(events, ['clear']);
});

test('only a sponsor failure without a client error counts as unanswered', () => {
  const refusal = new CtxError(400, '{"error":"ErrSavingsUnavailable"}');
  assert.throws(() => UnansweredDeposit.rethrow(refusal), (error) => error === refusal);
  for (const error of [new TypeError('Network request failed'), new CtxError(502, 'bad gateway')]) {
    assert.throws(
      () => UnansweredDeposit.rethrow(error),
      (thrown) => thrown instanceof UnansweredDeposit && thrown.cause === error,
    );
  }
});
