import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Market } from './market.ts';

test('a supported chosen country wins over the locale', () => {
  assert.equal(Market.resolve('GB', ['en-US']), 'GB');
});

test('an unsupported chosen country falls through to the locale region', () => {
  assert.equal(Market.resolve('JP', ['fr-FR']), 'FR');
});

test('the first supported locale region is used', () => {
  assert.equal(Market.resolve(null, ['ja-JP', 'en-CA']), 'CA');
});

test('script subtags and underscores are read', () => {
  assert.equal(Market.regionOf('zh-Hant-TW'), 'TW');
  assert.equal(Market.regionOf('en_gb'), 'GB');
});

test('a locale without a region gives no region', () => {
  assert.equal(Market.regionOf('en'), undefined);
  assert.equal(Market.regionOf(undefined), undefined);
});

test('no supported choice or locale gives the fallback market', () => {
  assert.equal(Market.resolve(undefined, ['en', 'ja-JP', undefined]), Market.fallback);
});
