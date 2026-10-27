import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dates, money } from './money.ts';
import { units } from './stellar/units.ts';

const plainSpaces = (text: string) => text.replace(/\s/g, ' ');

test('fiat follows the locale', () => {
  assert.equal(money.fiat('25.00', 'GBP', 'en-GB'), '£25.00');
  assert.equal(money.fiat('1234.5', 'USD', 'en-US'), '$1,234.50');
  assert.equal(plainSpaces(money.fiat('10', 'EUR', 'de-DE')), '10,00 €');
});

test('fiat truncates and never rounds up', () => {
  assert.equal(money.fiat('9.999', 'USD', 'en-US'), '$9.99');
});

test('fiat falls back on an unknown currency or amount', () => {
  assert.equal(money.fiat('5', 'XYZ1', 'en-US'), '5 XYZ1');
  assert.equal(money.fiat('abc', 'USD', 'en-US'), 'abc USD');
});

test('token shows a stable token in its peg currency and XLM as XLM', () => {
  assert.equal(money.token(units.parse('12.3456789'), 'XLM.GBPLOOP', 'en-GB'), '£12.34');
  assert.equal(money.token(units.parse('12.3456789'), 'XLM', 'en-GB'), '12.34 XLM');
  assert.equal(money.token(units.parse('1234.5'), 'XLM', 'en-US'), '1,234.50 XLM');
});

test('ctx routes token codes through the peg and fiat codes through fiat', () => {
  assert.equal(money.ctx('0.1234567', 'XLM.GBPLOOP', 'en-GB'), '£0.12');
  assert.equal(money.ctx('3.5', 'XLM', 'en-US'), '3.50 XLM');
  assert.equal(money.ctx('25.00', 'USD', 'en-US'), '$25.00');
  assert.equal(money.ctx('abc', 'XLM', 'en-US'), 'abc XLM');
});

test('payment keeps every significant decimal and the token symbol', () => {
  assert.equal(money.payment('25.6789000', 'XLM.USDC', 'en-US'), '25.6789 USDC');
  assert.equal(money.payment('0.0000001', 'XLM', 'en-US'), '0.0000001 XLM');
  assert.equal(money.payment('1234.5000000', 'XLM.GBPLOOP', 'en-US'), '1,234.50 GBPLOOP');
  assert.equal(money.payment('abc', 'XLM', 'en-US'), 'abc XLM');
});

test('payment uses the locale decimal separator', () => {
  assert.equal(plainSpaces(money.payment('1234.5678', 'XLM.EURC', 'de-DE')), '1.234,5678 EURC');
});

test('dates follow the locale and fall back on an invalid date', () => {
  assert.equal(dates.day('2026-03-04T10:00:00Z', 'en-GB'), '4 Mar 2026');
  assert.equal(dates.day('not a date', 'en-GB'), 'not a date');
  assert.equal(dates.time('not a date', 'en-GB'), 'not a date');
});
