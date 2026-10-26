import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FavouriteIds } from './favourite-ids.ts';

test('a new favourite comes first', () => {
  const favourites = new FavouriteIds(['a', 'b']).toggled('c');
  assert.deepEqual(favourites.ids, ['c', 'a', 'b']);
});

test('toggling a favourite again removes it', () => {
  const favourites = new FavouriteIds(['a', 'b']).toggled('a');
  assert.deepEqual(favourites.ids, ['b']);
  assert.equal(favourites.has('a'), false);
});

test('favourites round-trip through storage', () => {
  const favourites = new FavouriteIds(['a', 'b']);
  assert.deepEqual(FavouriteIds.parse(favourites.serialize()).ids, ['a', 'b']);
});

test('unreadable storage is no favourites', () => {
  assert.deepEqual(FavouriteIds.parse(null).ids, []);
  assert.deepEqual(FavouriteIds.parse('{').ids, []);
  assert.deepEqual(FavouriteIds.parse('{"a":1}').ids, []);
  assert.deepEqual(FavouriteIds.parse('["a",2]').ids, ['a']);
});

test('favourites are kept per user', () => {
  assert.notEqual(FavouriteIds.storageKey('u1'), FavouriteIds.storageKey('u2'));
});
