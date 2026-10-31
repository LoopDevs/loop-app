import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Savings } from './savings.ts';

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
