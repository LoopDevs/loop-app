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

test('a flapping connection refreshes once per minimum interval', () => {
  const refresh = new ForegroundRefresh();
  assert.equal(refresh.shouldRefreshOnReconnect(0), true);
  assert.equal(refresh.shouldRefreshOnReconnect(500), false);
  assert.equal(refresh.shouldRefreshOnReconnect(ForegroundRefresh.minimumIntervalMs), true);
});

test('a reconnect right after a foreground refresh still refreshes', () => {
  const refresh = new ForegroundRefresh();
  refresh.shouldRefresh('background', 0);
  assert.equal(refresh.shouldRefresh('active', 100), true);
  assert.equal(refresh.shouldRefreshOnReconnect(200), true);
});

test('a clock that moved backwards does not hold back the next foreground refresh', () => {
  const refresh = new ForegroundRefresh();
  refresh.shouldRefresh('background', 0);
  assert.equal(refresh.shouldRefresh('active', 1_000_000), true);
  refresh.shouldRefresh('background', 1_000_100);
  assert.equal(refresh.shouldRefresh('active', 500), true);
});

test('a clock that moved backwards does not hold back the next reconnect refresh', () => {
  const refresh = new ForegroundRefresh();
  assert.equal(refresh.shouldRefreshOnReconnect(1_000_000), true);
  assert.equal(refresh.shouldRefreshOnReconnect(500), true);
  assert.equal(refresh.shouldRefreshOnReconnect(501), false);
});

test('the minimum interval is measured from the last refresh that was allowed, not the last skipped one', () => {
  const refresh = new ForegroundRefresh();
  refresh.shouldRefresh('background', 0);
  assert.equal(refresh.shouldRefresh('active', 100), true);
  refresh.shouldRefresh('background', 10_000);
  assert.equal(refresh.shouldRefresh('active', 10_001), false);
  refresh.shouldRefresh('background', 14_000);
  assert.equal(refresh.shouldRefresh('active', 100 + ForegroundRefresh.minimumIntervalMs - 1), false);
  refresh.shouldRefresh('background', 15_000);
  assert.equal(refresh.shouldRefresh('active', 100 + ForegroundRefresh.minimumIntervalMs), true);
});

test('going active again after a skipped return needs another trip to the background', () => {
  const refresh = new ForegroundRefresh();
  refresh.shouldRefresh('background', 0);
  assert.equal(refresh.shouldRefresh('active', 100), true);
  refresh.shouldRefresh('background', 200);
  assert.equal(refresh.shouldRefresh('active', 300), false);
  assert.equal(refresh.shouldRefresh('active', 100 + ForegroundRefresh.minimumIntervalMs + 1), false);
});

test('inactive, unknown and repeated background states never refresh', () => {
  const refresh = new ForegroundRefresh();
  for (const state of ['background', 'background', 'inactive', 'unknown', 'extension']) {
    assert.equal(refresh.shouldRefresh(state, 1_000), false, state);
  }
  assert.equal(refresh.shouldRefresh('active', 1_001), true);
});

test('foreground and reconnect intervals are tracked separately in either order', () => {
  const refresh = new ForegroundRefresh();
  assert.equal(refresh.shouldRefreshOnReconnect(0), true);
  refresh.shouldRefresh('background', 10);
  assert.equal(refresh.shouldRefresh('active', 20), true);
  assert.equal(refresh.shouldRefreshOnReconnect(30), false);
  refresh.shouldRefresh('background', 40);
  assert.equal(refresh.shouldRefresh('active', 50), false);
});
