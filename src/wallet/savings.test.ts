import assert from 'node:assert/strict';
import { test } from 'node:test';

import { network } from '../stellar/network.ts';
import { units } from '../stellar/units.ts';
import { Savings, SavingsRate } from './savings.ts';

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
