import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CtxError } from '../ctx/ctx-error.ts';
import { money } from '../money.ts';
import { network } from '../stellar/network.ts';
import { units } from '../stellar/units.ts';
import { PendingDeposit, Savings, SavingsRate, UnansweredDeposit } from './savings.ts';
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
  assert.deepEqual(Savings.depositIntent('XLM.USDC', max), {
    intent: 'vault_deposit',
    currency: 'XLM.USDC',
    amount: '12.3456789',
  });
  assert.equal(Savings.depositIntent('XLM.USDC', units.parse('1')).amount, '1.0000000');
});

test('withdraw shares go to CTX as a 7-decimal amount that parses back to the same base units', () => {
  assert.deepEqual(Savings.withdrawIntent('XLM.USDC', 123456789n), {
    intent: 'vault_withdraw',
    currency: 'XLM.USDC',
    shares: '12.3456789',
  });
  assert.equal(units.parse(Savings.withdrawIntent('XLM.USDC', 1n).shares), 1n);
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

test('the pound vault has a fixed rate and its own headline', () => {
  network.vaults['XLM.GBPLOOP'] = 'CGBPLOOPVAULT';
  try {
    assert.equal(SavingsRate.fixedFor('XLM.GBPLOOP')?.figure(), '4%');
    assert.equal(Savings.rateHeadline('XLM.GBPLOOP'), 'Earn 4% a year');
  } finally {
    delete network.vaults['XLM.GBPLOOP'];
  }
  assert.equal(SavingsRate.fixedFor('XLM.GBPLOOP'), null);
  assert.equal(SavingsRate.fixedFor('XLM.USDC'), null);
  assert.equal(Savings.rateHeadline('XLM.USDC'), 'Earn up to 5% a year, variable');
  assert.equal(Savings.rateHeadline(null), 'Earn up to 5% a year, variable');
});

test('the projected value grows from the daily step at the yearly rate', () => {
  const rate = new SavingsRate(400);
  const value = units.parse('100');
  const midnight = Date.UTC(2026, 10, 2);
  assert.equal(rate.sinceDailyStep(midnight), 0);
  assert.equal(rate.projected(value, midnight), 100);
  const halfDay = midnight + SavingsRate.dayMs / 2;
  assert.equal(rate.sinceDailyStep(halfDay), SavingsRate.dayMs / 2);
  const expected = 100 + (100 * 0.04) / 365 / 2;
  assert.ok(Math.abs(rate.projected(value, halfDay) - expected) < 1e-9);
  assert.ok(rate.projected(value, halfDay + 1) > rate.projected(value, halfDay));
});

function depositStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: async (key: string) => items.get(key) ?? null,
    setItem: async (key: string, value: string) => void items.set(key, value),
    removeItem: async (key: string) => void items.delete(key),
  };
}

test('a deposit whose sponsor answer is lost blocks the next one until its landing window closes', async () => {
  const storage = depositStorage();
  const pending = new PendingDeposit(storage, 'CWALLET');
  await assert.rejects(
    pending.sponsored(500, async () => {
      throw new TypeError('Network request failed');
    }),
    UnansweredDeposit,
  );
  await assert.rejects(new PendingDeposit(storage, 'CWALLET').requireNone(async () => 500), {
    message: PendingDeposit.inFlightMessage,
  });
  await new PendingDeposit(storage, 'COTHER').requireNone(async () => 500);
  await new PendingDeposit(storage, 'CWALLET').requireNone(async () => 600);
  assert.equal(storage.items.size, 0);
});

test('an answered or refused deposit leaves no pending record', async () => {
  const storage = depositStorage();
  const pending = new PendingDeposit(storage, 'CWALLET');
  assert.equal(await pending.sponsored(500, async () => 'sent'), 'sent');
  assert.equal(storage.items.size, 0);
  await assert.rejects(
    pending.sponsored(500, async () => {
      throw new CtxError(400, '{"error":"ErrSavingsUnavailable"}');
    }),
    CtxError,
  );
  assert.equal(storage.items.size, 0);
});

test('money outside savings is named with its amounts', () => {
  assert.equal(
    Savings.notSavedMessage([{ currency: 'XLM.USDC', amount: units.parse('2.5') }]),
    `${money.token(units.parse('2.5'), 'XLM.USDC')} of your money is not in savings yet.`,
  );
});
