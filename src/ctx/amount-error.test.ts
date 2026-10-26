import assert from 'node:assert/strict';
import { test } from 'node:test';

import { amountErrorMessage, withdrawalAmountErrorMessage } from './amount-error.ts';

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

function ctxBody(fields: Record<string, string>) {
  return {
    errorName: () => fields.error,
    bodyField: (name: string) => fields[name],
  };
}

test('withdrawal limits come from the top-level min and max', () => {
  assert.equal(
    withdrawalAmountErrorMessage(ctxBody({ error: 'ErrAmountBelowMinimum', message: 'too low', min: 'GBP 10.00' })),
    'Minimum is GBP 10.00',
  );
  assert.equal(
    withdrawalAmountErrorMessage(ctxBody({ error: 'ErrAmountAboveMaximum', message: 'too high', max: 'GBP 1000.00' })),
    'Maximum is GBP 1000.00',
  );
  assert.equal(
    withdrawalAmountErrorMessage(ctxBody({ error: 'ErrAmountFractional' })),
    'Use whole pence (2 decimal places)',
  );
  assert.equal(withdrawalAmountErrorMessage(ctxBody({ error: 'ErrAmountBelowMinimum' })), null);
  assert.equal(withdrawalAmountErrorMessage(ctxBody({ error: 'ErrBankWithdrawalOpen' })), null);
});
