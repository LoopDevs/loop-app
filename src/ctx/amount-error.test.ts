import assert from 'node:assert/strict';
import { test } from 'node:test';

import { amountErrorMessage } from './amount-error.ts';

const range = { currency: 'GBP', denominations: ['5.00', '500.00'] };
const fixed = { currency: 'USD', denominations: ['10', '25', '50'] };

test('below minimum names the minimum', () => {
  assert.equal(amountErrorMessage('ErrAmountBelowMinimum', range), 'Minimum is 5.00 GBP');
});

test('above maximum names the maximum', () => {
  assert.equal(amountErrorMessage('ErrAmountAboveMaximum', range), 'Maximum is 500.00 GBP');
});

test('invalid denomination lists the choices', () => {
  assert.equal(amountErrorMessage('ErrAmountDenominationInvalid', fixed), 'Choose one of 10, 25, 50');
});

test('fractional amount asks for whole amounts', () => {
  assert.equal(amountErrorMessage('ErrAmountFractional', range), 'Whole amounts only');
});

test('no available discount asks for another amount', () => {
  assert.equal(
    amountErrorMessage('ErrNoDiscountsAvailable', range),
    "This amount isn't available right now, try another",
  );
});

test('other errors are not amount errors', () => {
  assert.equal(amountErrorMessage('ErrServerError', range), null);
  assert.equal(amountErrorMessage(undefined, range), null);
});
