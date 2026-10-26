import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { MerchantJson } from './client.ts';
import { Merchant } from './merchant.ts';

const json: MerchantJson = {
  id: 'm1',
  slug: 'aerie',
  name: 'Aerie',
  country: 'US',
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

test('estimate rounds half up to the card currency subunit', () => {
  assert.equal(new Merchant(json).cashbackEstimate('25.00', 'en-US'), '$0.63');
  assert.equal(new Merchant(json).cashbackEstimate('25.19', 'en-US'), '$0.63');
});

test('estimate rounds to whole units for a currency without subunits', () => {
  const yen = new Merchant({ ...json, currency: 'JPY' });
  assert.equal(yen.cashbackEstimate('1020', 'en-US'), '¥26');
});

test('estimate is null for an amount that is not a positive number', () => {
  assert.equal(new Merchant(json).cashbackEstimate('abc', 'en-US'), null);
  assert.equal(new Merchant(json).cashbackEstimate('0', 'en-US'), null);
});

test('a search name is matched literally', () => {
  assert.equal(Merchant.searchPattern(' Toys"R"Us (US) '), 'Toys"R"Us \\(US\\)');
  assert.equal(Merchant.searchPattern('A.B*C+?'), 'A\\.B\\*C\\+\\?');
});

test('the tile hue is stable for a name and within the colour wheel', () => {
  const hue = new Merchant(json).tileHue();
  assert.equal(new Merchant({ ...json, id: 'm2' }).tileHue(), hue);
  assert.ok(hue >= 0 && hue < 360);
  assert.notEqual(new Merchant({ ...json, name: 'Target' }).tileHue(), hue);
});

test('the initial is the first letter of the name, capitalised', () => {
  assert.equal(new Merchant({ ...json, name: ' eBay' }).initial(), 'E');
});

test('a website without a scheme opens over https', () => {
  assert.equal(new Merchant({ ...json, website: 'aerie.com' }).websiteUrl(), 'https://aerie.com');
  assert.equal(new Merchant({ ...json, website: 'http://aerie.com' }).websiteUrl(), 'http://aerie.com');
  assert.equal(new Merchant(json).websiteUrl(), undefined);
});

test('recent merchants keep purchase order without repeats', () => {
  const giftCards = [{ merchantId: 'b' }, { merchantId: 'a' }, { merchantId: 'b' }, { merchantId: 'c' }];
  assert.deepEqual(Merchant.idsByRecentPurchase(giftCards, 2), ['b', 'a']);
});

test('merchants follow the given id order and missing ids are skipped', () => {
  const a = new Merchant({ ...json, id: 'a', name: 'A' });
  const b = new Merchant({ ...json, id: 'b', name: 'B' });
  assert.deepEqual(
    Merchant.inOrder([a, b], ['b', 'gone', 'a']).map((merchant) => merchant.id),
    ['b', 'a'],
  );
});

test('merchants sort by the cashback rate shown, overrides included', () => {
  const low = new Merchant({ ...json, id: 'low', userDiscount: 900 });
  const overridden = new Merchant({
    ...json,
    id: 'overridden',
    userDiscount: 100,
    link: { userDiscountOverride: true, userDiscountBasisPoints: 1200 },
  });
  const high = new Merchant({ ...json, id: 'high', userDiscount: 1000 });
  assert.deepEqual(
    Merchant.byCashback([low, overridden, high]).map((merchant) => merchant.id),
    ['overridden', 'high', 'low'],
  );
});

test('categories list the most common first and skip merchants without any', () => {
  const merchants = [
    new Merchant({ ...json, id: 'a', categories: ['food'] }),
    new Merchant({ ...json, id: 'b', categories: ['fashion', 'food'] }),
    new Merchant({ ...json, id: 'c' }),
  ];
  assert.deepEqual(Merchant.categoriesOf(merchants), ['food', 'fashion']);
});
