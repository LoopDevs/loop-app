import assert from 'node:assert/strict';
import { test } from 'node:test';

import { currencyRefusalMessage } from './currency-refusal.ts';

test('a cashback refusal names the currency', () => {
  assert.equal(
    currencyRefusalMessage('ErrCashbackNotStable', 'XLM'),
    "Can't earn cashback paying in XLM. Pick another currency.",
  );
});

test('a missing rate names the currency', () => {
  assert.equal(currencyRefusalMessage('ErrRateUnavailable', 'EURC'), "Can't price this card in EURC");
});

test('other errors are not currency refusals', () => {
  assert.equal(currencyRefusalMessage('ErrAmountBelowMinimum', 'USDC'), null);
  assert.equal(currencyRefusalMessage(undefined, 'USDC'), null);
});
