import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeAmount } from './amount-input.ts';

test('a decimal comma becomes a decimal point', () => {
  assert.equal(normalizeAmount('25,50'), '25.50');
  assert.equal(normalizeAmount(' 7,5 '), '7.5');
});

test('dotted and whole amounts pass through trimmed', () => {
  assert.equal(normalizeAmount('25.50'), '25.50');
  assert.equal(normalizeAmount(' 25 '), '25');
});

test('thousands separators and other text are refused', () => {
  assert.equal(normalizeAmount('1,000.50'), null);
  assert.equal(normalizeAmount('1,000'), null);
  assert.equal(normalizeAmount('25,500'), null);
  assert.equal(normalizeAmount('1,000,50'), null);
  assert.equal(normalizeAmount('abc'), null);
  assert.equal(normalizeAmount(''), null);
  assert.equal(normalizeAmount('25,'), null);
  assert.equal(normalizeAmount('-5'), null);
});
