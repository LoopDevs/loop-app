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

const invalidAmounts = ['', '   ', 'abc', '1e5', '-1', '1,5', '.5', '5.', '.', '1.2.3', '1 2', '0x10', '1.12345678'];

test('parse reads whole and fractional amounts into the smallest unit', () => {
  assert.equal(units.parse('0'), 0n);
  assert.equal(units.parse('0.0000001'), 1n);
  assert.equal(units.parse('1'), 10_000_000n);
  assert.equal(units.parse('12.5'), 125_000_000n);
  assert.equal(units.parse('1.1234567'), 11_234_567n);
  assert.equal(units.parse('  3.25  '), 32_500_000n);
});

test('parse rejects amounts that are empty, negative, non-numeric, malformed or finer than 7 decimals', () => {
  for (const amount of invalidAmounts) {
    assert.throws(() => units.parse(amount), /Invalid token amount/, `parse(${JSON.stringify(amount)})`);
  }
});

test('parseTruncated reads whole and fractional amounts into the smallest unit', () => {
  assert.equal(units.parseTruncated('0'), 0n);
  assert.equal(units.parseTruncated('0.0000001'), 1n);
  assert.equal(units.parseTruncated('25.00'), 250_000_000n);
  assert.equal(units.parseTruncated(' 7.5 '), 75_000_000n);
});

test('parseTruncated drops decimals beyond the seventh without rounding', () => {
  assert.equal(units.parseTruncated('1.12345678'), 11_234_567n);
  assert.equal(units.parseTruncated('1.99999999'), 19_999_999n);
  assert.equal(units.parseTruncated('0.00000009'), 0n);
});

test('parseTruncated returns null for amounts that are empty, negative, non-numeric or malformed', () => {
  for (const amount of ['', '   ', 'abc', '1e5', '-1', '1,5', '.5', '5.', '.', '1.2.3', '0x10']) {
    assert.equal(units.parseTruncated(amount), null, `parseTruncated(${JSON.stringify(amount)})`);
  }
});

test('format shows zero and whole amounts with the requested decimals', () => {
  assert.equal(units.format(0n), '0.00');
  assert.equal(units.format(0n, 7), '0.0000000');
  assert.equal(units.format(units.parse('5')), '5.00');
});

test('format truncates the fraction and never rounds up', () => {
  assert.equal(units.format(units.parse('0.0199999')), '0.01');
  assert.equal(units.format(units.parse('0.9999999')), '0.99');
  assert.equal(units.format(1n, 7), '0.0000001');
  assert.equal(units.format(-1n), '-0.00');
});
