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
  denominationValues: ['5.00', '500.00'],
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

test('denomination values are read from the merchant JSON', () => {
  assert.deepEqual(new Merchant(json).denominationValues, ['5.00', '500.00']);
  assert.deepEqual(new Merchant({ ...json, denominationValues: null }).denominationValues, []);
});

test('a range merchant shows its range in whole units when it can', () => {
  assert.equal(new Merchant(json).rangeLabel('en-US'), '$5 – $500');
  assert.equal(new Merchant({ ...json, denominationValues: ['2.50', '50'] }).rangeLabel('en-US'), '$2.50 – $50');
});

test('a fixed merchant has no range and no quick amounts', () => {
  const fixed = new Merchant({ ...json, denominationType: 'fixed', denominationValues: ['10', '25'] });
  assert.equal(fixed.rangeLabel('en-US'), null);
  assert.deepEqual(fixed.quickAmounts(), []);
});

test('search matches rank name starts, then word starts, then anywhere', () => {
  const named = (id: string, name: string, userDiscount = 0) => new Merchant({ ...json, id, name, userDiscount });
  const merchants = [
    named('a', 'Banana Republic'),
    named('b', 'Old Navy'),
    named('c', 'Navyfield'),
    named('d', 'Café Navy', 500),
  ];
  assert.deepEqual(
    Merchant.matching(merchants, ' NAVY ', 10).map((merchant) => merchant.id),
    ['c', 'd', 'b'],
  );
  assert.deepEqual(
    Merchant.matching(merchants, 'cafe', 10).map((merchant) => merchant.id),
    ['d'],
  );
  assert.deepEqual(Merchant.matching(merchants, 'an', 1).map((merchant) => merchant.id), ['a']);
  assert.deepEqual(Merchant.matching(merchants, '  ', 10), []);
});

test('quick amounts fall inside the range', () => {
  assert.deepEqual(new Merchant(json).quickAmounts(), ['10', '25', '50', '100']);
  assert.deepEqual(new Merchant({ ...json, denominationValues: ['30', '150'] }).quickAmounts(), ['50', '100']);
});

test('an exact amount inside the range is accepted', () => {
  const merchant = new Merchant(json);
  assert.equal(merchant.amountProblem('37.50', 'en-US'), null);
  assert.equal(merchant.amountProblem('5', 'en-US'), null);
  assert.equal(merchant.amountProblem('500.00', 'en-US'), null);
  assert.equal(merchant.amountProblem('', 'en-US'), null);
});

test('an amount outside the range names the range', () => {
  const merchant = new Merchant(json);
  assert.equal(merchant.amountProblem('4.99', 'en-US'), 'Enter between $5 and $500');
  assert.equal(merchant.amountProblem('500.01', 'en-US'), 'Enter between $5 and $500');
});

test('an amount that is not a number or has too many decimals is rejected', () => {
  const merchant = new Merchant(json);
  assert.equal(merchant.amountProblem('abc', 'en-US'), 'Enter an amount like 25 or 25.50');
  assert.equal(merchant.amountProblem('25.505', 'en-US'), 'Enter an amount like 25 or 25.50');
});

test('a whole-units merchant rejects cents', () => {
  const merchant = new Merchant({ ...json, denominationType: 'min-max-major' });
  assert.equal(merchant.amountProblem('25.50', 'en-US'), 'Enter a whole amount, like 25');
  assert.equal(merchant.amountProblem('25.00', 'en-US'), null);
});

test('a website label drops the scheme, www and trailing slash', () => {
  assert.equal(new Merchant({ ...json, website: 'https://www.aerie.com/' }).websiteLabel(), 'aerie.com');
  assert.equal(new Merchant({ ...json, website: 'aerie.com/gift' }).websiteLabel(), 'aerie.com/gift');
  assert.equal(new Merchant(json).websiteLabel(), undefined);
});

test('where to use and delivery read the redeem location and type', () => {
  const merchant = new Merchant({ ...json, redeemLocation: 'physical', redeemType: 'url' });
  assert.equal(merchant.whereToUse(), 'In store');
  assert.equal(merchant.deliveryLabel(), 'A link to redeem');
  assert.equal(new Merchant({ ...json, redeemLocation: 'any' }).whereToUse(), 'Online and in store');
});

test('an empty redeem location or type has no label', () => {
  const merchant = new Merchant({ ...json, redeemLocation: '', redeemType: '' });
  assert.equal(merchant.redeemLocation, undefined);
  assert.equal(merchant.whereToUse(), null);
  assert.equal(merchant.deliveryLabel(), null);
});

test('amounts show the range, or each fixed value', () => {
  assert.equal(new Merchant(json).amountsLabel('en-US'), '$5 – $500');
  const fixed = new Merchant({ ...json, denominationType: 'fixed', denominationValues: ['10.00', '25.50'] });
  assert.equal(fixed.amountsLabel('en-US'), '$10, $25.50');
  assert.equal(new Merchant({ ...json, denominationType: 'fixed', denominationValues: [] }).amountsLabel(), null);
});
