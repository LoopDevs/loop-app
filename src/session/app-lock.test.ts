import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AppLock, lockAfterBackgroundMs } from './app-lock.ts';

const start = 1_000_000;

function unlockedThenBackgrounded(): AppLock {
  return AppLock.loading().loaded(true).unlocked().backgrounded(start);
}

test('the app is covered while the lock preference loads', () => {
  assert.equal(AppLock.loading().covers(), true);
});

test('cold start with the lock on shows the lock', () => {
  const lock = AppLock.loading().loaded(true);
  assert.equal(lock.status, 'locked');
  assert.equal(lock.covers(), true);
});

test('cold start with the lock off shows the app', () => {
  const lock = AppLock.loading().loaded(false);
  assert.equal(lock.status, 'off');
  assert.equal(lock.covers(), false);
});

test('a late preference load does not change a settled lock', () => {
  const lock = AppLock.loading().loaded(true).unlocked().loaded(true);
  assert.equal(lock.status, 'unlocked');
});

test('unlocking uncovers the app', () => {
  const lock = AppLock.loading().loaded(true).unlocked();
  assert.equal(lock.status, 'unlocked');
  assert.equal(lock.covers(), false);
});

test('the app stays covered while in the background', () => {
  assert.equal(unlockedThenBackgrounded().covers(), true);
});

test('returning before the timeout resumes without a prompt', () => {
  const lock = unlockedThenBackgrounded().foregrounded(start + lockAfterBackgroundMs - 1);
  assert.equal(lock.status, 'unlocked');
  assert.equal(lock.covers(), false);
});

test('returning at or after the timeout locks', () => {
  assert.equal(
    unlockedThenBackgrounded().foregrounded(start + lockAfterBackgroundMs).status,
    'locked',
  );
  assert.equal(
    unlockedThenBackgrounded().foregrounded(start + 10 * lockAfterBackgroundMs).status,
    'locked',
  );
});

test('a clock moved backwards while in the background locks', () => {
  assert.equal(unlockedThenBackgrounded().foregrounded(start - 1).status, 'locked');
});

test('repeated background events keep the first background time', () => {
  const lock = unlockedThenBackgrounded().backgrounded(start + lockAfterBackgroundMs);
  assert.equal(lock.backgroundedAt, start);
});

test('background and foreground do nothing with the lock off', () => {
  const lock = AppLock.loading()
    .loaded(false)
    .backgrounded(start)
    .foregrounded(start + 2 * lockAfterBackgroundMs);
  assert.equal(lock.status, 'off');
  assert.equal(lock.covers(), false);
});

test('backgrounding while locked keeps the lock', () => {
  const lock = AppLock.loading().loaded(true).backgrounded(start).foregrounded(start + 1);
  assert.equal(lock.status, 'locked');
});

test('backgrounding keeps an open in-app browser until the lock engages', () => {
  const backgrounded = unlockedThenBackgrounded();
  assert.equal(backgrounded.covers(), true);
  assert.equal(backgrounded.closesBrowser(), false);
  assert.equal(backgrounded.foregrounded(start + lockAfterBackgroundMs - 1).closesBrowser(), false);
});

test('the in-app browser closes once the app locks', () => {
  assert.equal(unlockedThenBackgrounded().foregrounded(start + lockAfterBackgroundMs).closesBrowser(), true);
  assert.equal(AppLock.loading().loaded(true).closesBrowser(), true);
});

test('the in-app browser stays open with the lock off', () => {
  assert.equal(AppLock.loading().loaded(false).closesBrowser(), false);
  assert.equal(AppLock.loading().closesBrowser(), false);
});

test('turning the lock on leaves the app unlocked', () => {
  const lock = AppLock.loading().loaded(false).turnedOn();
  assert.equal(lock.status, 'unlocked');
  assert.equal(lock.isOn(), true);
});

test('turning the lock off stops background locking', () => {
  const lock = AppLock.loading()
    .loaded(true)
    .unlocked()
    .turnedOff()
    .backgrounded(start)
    .foregrounded(start + 2 * lockAfterBackgroundMs);
  assert.equal(lock.status, 'off');
  assert.equal(lock.isOn(), false);
});

test('only a successful authentication unlocks a secured device', () => {
  assert.equal(AppLock.unlocksWith({ success: true }), true);
  assert.equal(AppLock.unlocksWith({ success: false, error: 'user_cancel' }), false);
  assert.equal(AppLock.unlocksWith({ success: false, error: 'authentication_failed' }), false);
  assert.equal(AppLock.unlocksWith({ success: false, error: 'lockout' }), false);
  assert.equal(AppLock.unlocksWith({ success: false, error: 'not_available' }), false);
});

test('a device with no screen lock left cannot keep the user locked out', () => {
  assert.equal(AppLock.unlocksWith({ success: false, error: 'not_enrolled' }), true);
  assert.equal(AppLock.unlocksWith({ success: false, error: 'passcode_not_set' }), true);
});

test('a failed preference read starts locked', () => {
  assert.equal(AppLock.loading().loadFailed().status, 'locked');
});

test('a failed preference read cannot change a settled lock', () => {
  assert.equal(AppLock.loading().loaded(false).loadFailed().status, 'off');
});

test('cancelled prompts are told apart from failures', () => {
  assert.equal(AppLock.isCancel({ success: false, error: 'user_cancel' }), true);
  assert.equal(AppLock.isCancel({ success: false, error: 'system_cancel' }), true);
  assert.equal(AppLock.isCancel({ success: false, error: 'authentication_failed' }), false);
  assert.equal(AppLock.isCancel({ success: true }), false);
});
