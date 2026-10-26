import assert from 'node:assert/strict';
import { test } from 'node:test';

import { criticalIndexOf, fetchedCriticalIndex, isCriticalUpdate, ReloadGate } from './critical-update.ts';

const manifestWith = (criticalIndex?: number) => ({
  extra: { expoClient: { extra: criticalIndex === undefined ? {} : { criticalIndex } } },
});

test('a missing or invalid critical index counts as 0', () => {
  assert.equal(criticalIndexOf(undefined), 0);
  assert.equal(criticalIndexOf(null), 0);
  assert.equal(criticalIndexOf({}), 0);
  assert.equal(criticalIndexOf({ criticalIndex: '3' }), 0);
  assert.equal(criticalIndexOf({ criticalIndex: 1.5 }), 0);
  assert.equal(criticalIndexOf({ criticalIndex: -2 }), 0);
  assert.equal(criticalIndexOf({ criticalIndex: 4 }), 4);
});

test('the fetched index is read from the manifest client extra', () => {
  assert.equal(fetchedCriticalIndex(manifestWith(2)), 2);
  assert.equal(fetchedCriticalIndex(manifestWith()), 0);
  assert.equal(fetchedCriticalIndex({ id: 'x' }), 0);
  assert.equal(fetchedCriticalIndex(undefined), 0);
});

test('an update is critical only when its index is higher than the running one', () => {
  assert.equal(isCriticalUpdate(manifestWith(1), { criticalIndex: 0 }), true);
  assert.equal(isCriticalUpdate(manifestWith(1), {}), true);
  assert.equal(isCriticalUpdate(manifestWith(1), { criticalIndex: 1 }), false);
  assert.equal(isCriticalUpdate(manifestWith(0), { criticalIndex: 1 }), false);
});

test('a client that skipped critical update 1 reloads on update 2', () => {
  assert.equal(isCriticalUpdate(manifestWith(2), { criticalIndex: 0 }), true);
});

test('a reload requested with nothing held runs at once', () => {
  const gate = new ReloadGate();
  let reloads = 0;
  gate.request(() => {
    reloads += 1;
  });
  assert.equal(reloads, 1);
});

test('a reload requested while a task runs waits until the task returns', async () => {
  const gate = new ReloadGate();
  let reloads = 0;
  let release: () => void = () => {};
  const held = gate.hold(() => new Promise<void>((resolve) => (release = resolve)));
  gate.request(() => {
    reloads += 1;
  });
  assert.equal(reloads, 0);
  release();
  await held;
  assert.equal(reloads, 1);
});

test('a reload requested while a task runs also waits until the task throws', async () => {
  const gate = new ReloadGate();
  let reloads = 0;
  const held = gate.hold(async () => {
    gate.request(() => {
      reloads += 1;
    });
    assert.equal(reloads, 0);
    throw new Error('send failed');
  });
  await assert.rejects(held, /send failed/);
  assert.equal(reloads, 1);
});

test('the reload waits for every overlapping task', async () => {
  const gate = new ReloadGate();
  let reloads = 0;
  let releaseFirst: () => void = () => {};
  let releaseSecond: () => void = () => {};
  const first = gate.hold(() => new Promise<void>((resolve) => (releaseFirst = resolve)));
  const second = gate.hold(() => new Promise<void>((resolve) => (releaseSecond = resolve)));
  gate.request(() => {
    reloads += 1;
  });
  releaseFirst();
  await first;
  assert.equal(reloads, 0);
  releaseSecond();
  await second;
  assert.equal(reloads, 1);
});
