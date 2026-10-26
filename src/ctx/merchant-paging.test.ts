import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { MerchantJson } from './client.ts';
import { Merchant } from './merchant.ts';
import { CategoryTally, MerchantPaging } from './merchant-paging.ts';

function merchant(id: string, categories: string[] = []): Merchant {
  const json: MerchantJson = {
    id,
    slug: id,
    name: id,
    country: 'US',
    currency: 'USD',
    denominationType: 'min-max',
    denominationValues: null,
    userDiscount: 0,
    categories,
  };
  return new Merchant(json);
}

test('next page is requested while pages remain and nothing is loading', () => {
  assert.equal(MerchantPaging.nextPage(1, 3, false), 2);
  assert.equal(MerchantPaging.nextPage(2, 3, false), 3);
});

test('no next page on the last page, before the first load, or while busy', () => {
  assert.equal(MerchantPaging.nextPage(3, 3, false), null);
  assert.equal(MerchantPaging.nextPage(0, 3, false), null);
  assert.equal(MerchantPaging.nextPage(1, 3, true), null);
});

test('the first page replaces what is shown', () => {
  const merged = MerchantPaging.merge([merchant('a')], [merchant('b')], 1);
  assert.deepEqual(
    merged.map((m) => m.id),
    ['b'],
  );
});

test('later pages append and skip merchants already shown', () => {
  const merged = MerchantPaging.merge([merchant('a'), merchant('b')], [merchant('b'), merchant('c')], 2);
  assert.deepEqual(
    merged.map((m) => m.id),
    ['a', 'b', 'c'],
  );
});

test('categories keep first-seen order and never repeat', () => {
  const tally = new CategoryTally();
  tally.add([merchant('a', ['food', 'travel'])]);
  tally.add([merchant('b', ['gaming', 'food'])]);
  assert.deepEqual(tally.list(), ['food', 'travel', 'gaming']);
});
