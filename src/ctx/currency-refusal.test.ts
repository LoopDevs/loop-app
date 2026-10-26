import assert from 'node:assert/strict';
import { test } from 'node:test';

import { currencyRefusalMessage, refusesCurrency } from './currency-refusal.ts';

test('a cashback refusal names the currency', () => {
  assert.equal(
    currencyRefusalMessage('ErrCashbackNotStable', 'XLM'),
    "Can't earn cashback paying in XLM. Pick another currency.",
  );
});

test('an unavailable rate reads as temporary and names the currency', () => {
  assert.equal(
    currencyRefusalMessage('ErrRateUnavailable', 'EURC'),
    'Pricing in EURC is unavailable right now. Try again shortly.',
  );
});

test('other errors are not currency refusals', () => {
  assert.equal(currencyRefusalMessage('ErrAmountBelowMinimum', 'USDC'), null);
  assert.equal(currencyRefusalMessage(undefined, 'USDC'), null);
});

test('only a cashback refusal rules the currency out', () => {
  assert.equal(refusesCurrency('ErrCashbackNotStable'), true);
  assert.equal(refusesCurrency('ErrRateUnavailable'), false);
  assert.equal(refusesCurrency(undefined), false);
});
