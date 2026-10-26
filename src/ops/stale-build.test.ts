import assert from 'node:assert/strict';
import { test } from 'node:test';

import { StaleBuild } from './stale-build.ts';

test('a page file that failed to load is a stale build', () => {
  const error = Object.assign(new Error('Loading module index.js failed.'), { name: 'AsyncRequireError' });
  assert.equal(StaleBuild.caused(error), true);
});

test('other errors are not a stale build', () => {
  assert.equal(StaleBuild.caused(new Error('boom')), false);
  assert.equal(StaleBuild.caused('AsyncRequireError'), false);
});

test('a reload is allowed once per cooldown', () => {
  assert.equal(StaleBuild.reloadAllowed(null, 1_000), true);
  assert.equal(StaleBuild.reloadAllowed(1_000, 20_000), false);
  assert.equal(StaleBuild.reloadAllowed(1_000, 40_000), true);
});
