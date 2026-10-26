import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { MerchantJson } from './client.ts';
import { Merchant } from './merchant.ts';

const json: MerchantJson = {
  id: 'm1',
  name: 'Aerie',
  currency: 'USD',
  denominationType: 'min-max',
  denominations: ['5.00', '500.00'],
  userDiscount: 250,
};

test('rate is the merchant default without an override', () => {
  assert.equal(new Merchant(json).cashbackBasisPoints(), 250);
});

test('rate is the company link rate with an override', () => {
  const merchant = new Merchant({
    ...json,
    link: { userDiscountOverride: true, userDiscountBasisPoints: 400 },
  });
  assert.equal(merchant.cashbackBasisPoints(), 400);
});

test('an override of zero is a zero rate', () => {
  const merchant = new Merchant({
    ...json,
    link: { userDiscountOverride: true, userDiscountBasisPoints: 0 },
  });
  assert.equal(merchant.cashbackBasisPoints(), 0);
});

test('a link without an override keeps the merchant default', () => {
  assert.equal(new Merchant({ ...json, link: {} }).cashbackBasisPoints(), 250);
});

test('rate label shows up to two decimals', () => {
  assert.equal(new Merchant(json).rateLabel('en-US'), '2.5% cashback');
  assert.equal(new Merchant({ ...json, userDiscount: 1234 }).rateLabel('en-US'), '12.34% cashback');
  assert.equal(new Merchant({ ...json, userDiscount: 500 }).rateLabel('en-US'), '5% cashback');
});

test('estimate truncates to the card currency subunit', () => {
  assert.equal(new Merchant(json).cashbackEstimate('25.00', 'en-US'), '$0.62');
});

test('estimate is null for an amount that is not a number', () => {
  assert.equal(new Merchant(json).cashbackEstimate('abc', 'en-US'), null);
});
