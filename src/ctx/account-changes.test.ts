import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

import { AccountChanges, type AccountSource } from './account-changes.ts';

type Opened = { onChange: () => void; closed: boolean };

let opened: Opened[] = [];
let failNextStart = false;
let endSession: () => void = () => undefined;

const source: AccountSource = {
  watchAccount(onChange) {
    if (failNextStart) {
      failNextStart = false;
      return Promise.reject(new Error('no session'));
    }
    const socket: Opened = { onChange, closed: false };
    opened.push(socket);
    return Promise.resolve(() => {
      socket.closed = true;
    });
  },
  onSessionEnd(listener) {
    endSession = listener;
    return () => {
      endSession = () => undefined;
    };
  },
};

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  opened = [];
  failNextStart = false;
  mock.timers.reset();
  mock.timers.enable({ apis: ['setTimeout'] });
});

test('listeners share one socket and hear a burst of changes once', () => {
  const changes = new AccountChanges(source);
  let heard = 0;
  const leaveFirst = changes.subscribe(() => (heard += 1));
  const leaveSecond = changes.subscribe(() => (heard += 1));
  assert.equal(opened.length, 1);
  opened[0].onChange();
  opened[0].onChange();
  mock.timers.tick(AccountChanges.coalesceMs);
  assert.equal(heard, 2);
  leaveFirst();
  leaveSecond();
});

test('a socket that fails to start is opened again while listeners remain', async () => {
  const changes = new AccountChanges(source);
  failNextStart = true;
  const leave = changes.subscribe(() => undefined);
  await settle();
  assert.equal(opened.length, 0);
  mock.timers.tick(AccountChanges.reopenMs);
  assert.equal(opened.length, 1);
  leave();
});

test('a session end closes the socket and opens a new one for the listeners that remain', async () => {
  const changes = new AccountChanges(source);
  const leave = changes.subscribe(() => undefined);
  endSession();
  await settle();
  assert.equal(opened[0].closed, true);
  mock.timers.tick(AccountChanges.reopenMs);
  assert.equal(opened.length, 2);
  assert.equal(opened[1].closed, false);
  leave();
});

test('the last listener leaving closes the socket and drops a planned reopen', async () => {
  const changes = new AccountChanges(source);
  failNextStart = true;
  const leave = changes.subscribe(() => undefined);
  await settle();
  leave();
  mock.timers.tick(AccountChanges.reopenMs);
  assert.equal(opened.length, 0);
  const leaveAgain = changes.subscribe(() => undefined);
  leaveAgain();
  await settle();
  assert.equal(opened[0].closed, true);
});
