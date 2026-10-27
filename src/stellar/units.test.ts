import assert from 'node:assert/strict';
import { test } from 'node:test';

import { units } from './units.ts';

test('format shows a positive amount truncated to the requested decimals', () => {
  assert.equal(units.format(units.parse('12.3456789')), '12.34');
  assert.equal(units.format(units.parse('0.05'), 7), '0.0500000');
});

test('format keeps the sign of a negative amount on the whole number', () => {
  assert.equal(units.format(-units.parse('1.5')), '-1.50');
  assert.equal(units.format(-units.parse('0.25')), '-0.25');
});
