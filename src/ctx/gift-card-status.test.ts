import assert from 'node:assert/strict';
import { test } from 'node:test';

import { giftCardStatusLabel } from './gift-card-status.ts';

test('every gift card status has a plain label', () => {
  assert.equal(giftCardStatusLabel('unpaid'), 'Waiting for payment');
  assert.equal(giftCardStatusLabel('paid'), 'Processing');
  assert.equal(giftCardStatusLabel('fulfilled'), 'Ready');
  assert.equal(giftCardStatusLabel('rejected'), 'Failed');
  assert.equal(giftCardStatusLabel('refunded'), 'Refunded');
  assert.equal(giftCardStatusLabel('expired'), 'Expired');
});
