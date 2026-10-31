import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { memoryLock } from './memory-lock.ts';
import { paymentLock as nativeLock } from './payment-lock.ts';
import { paymentLock as webLock } from './payment-lock.web.ts';

const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function setNavigator(value: unknown): void {
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
}

afterEach(() => {
  if (navigatorDescriptor) {
    Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, 'navigator');
  }
});

test('the native payment lock is the in-memory lock', () => {
  assert.equal(nativeLock, memoryLock);
});

test('the web payment lock runs the task under the browser lock with the same name', async () => {
  const requested: string[] = [];
  setNavigator({
    locks: {
      request: async (name: string, task: () => Promise<unknown>) => {
        requested.push(name);
        return task();
      },
    },
  });
  assert.equal(await webLock.exclusive('pay:u1', async () => 'sent'), 'sent');
  assert.deepEqual(requested, ['pay:u1']);
});

test('the web payment lock passes a task failure through the browser lock', async () => {
  setNavigator({
    locks: { request: async (_name: string, task: () => Promise<unknown>) => task() },
  });
  await assert.rejects(
    webLock.exclusive('pay:u1', async () => {
      throw new Error('refused');
    }),
    /refused/,
  );
});

test('without browser locks the web payment lock serialises tasks of the same name', async () => {
  setNavigator({});
  const order: string[] = [];
  let release: () => void = () => undefined;
  const first = webLock.exclusive('pay:u2', async () => {
    order.push('first start');
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    order.push('first end');
  });
  const second = webLock.exclusive('pay:u2', async () => {
    order.push('second start');
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, ['first start']);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(order, ['first start', 'first end', 'second start']);
});

test('without a navigator the web payment lock still locks', async () => {
  Reflect.deleteProperty(globalThis, 'navigator');
  assert.equal(await webLock.exclusive('pay:u3', async () => 7), 7);
});
