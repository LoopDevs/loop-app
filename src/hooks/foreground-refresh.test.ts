import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ForegroundRefresh } from './foreground-refresh.ts';

test('an inactive pause without backgrounding does not refresh', () => {
  const refresh = new ForegroundRefresh();
  assert.equal(refresh.shouldRefresh('inactive', 0), false);
  assert.equal(refresh.shouldRefresh('active', 1_000), false);
});

test('returning from background through inactive refreshes once', () => {
  const refresh = new ForegroundRefresh();
  assert.equal(refresh.shouldRefresh('inactive', 0), false);
  assert.equal(refresh.shouldRefresh('background', 10), false);
  assert.equal(refresh.shouldRefresh('inactive', 20), false);
  assert.equal(refresh.shouldRefresh('active', 30), true);
  assert.equal(refresh.shouldRefresh('active', 40), false);
});

test('a second return inside the minimum interval is skipped', () => {
  const refresh = new ForegroundRefresh();
  refresh.shouldRefresh('background', 0);
  assert.equal(refresh.shouldRefresh('active', 100), true);
  refresh.shouldRefresh('background', 200);
  assert.equal(refresh.shouldRefresh('active', 300), false);
  refresh.shouldRefresh('background', 400);
  assert.equal(refresh.shouldRefresh('active', 100 + ForegroundRefresh.minimumIntervalMs), true);
});
