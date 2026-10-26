import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Savings } from './savings.ts';

test('savings takes its own vault currency', () => {
  assert.equal(Savings.takes(Savings.currency), true);
});

test('savings takes no other currency', () => {
  for (const currency of ['XLM.GBPLOOP', 'XLM.EURC', 'XLM', '', undefined]) {
    assert.equal(Savings.takes(currency), false, String(currency));
  }
});
