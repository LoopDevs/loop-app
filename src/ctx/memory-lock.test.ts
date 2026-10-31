import assert from 'node:assert/strict';
import { test } from 'node:test';

import { memoryLock as paymentLock } from './memory-lock.ts';

function gate() {
  let open = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

test('a task waits for the running task with the same name', async () => {
  const first = gate();
  const order: string[] = [];
  const running = paymentLock.exclusive('topUp:G1', async () => {
    order.push('first start');
    await first.opened;
    order.push('first end');
  });
  const queued = paymentLock.exclusive('topUp:G1', async () => {
    order.push('second');
  });
  await Promise.resolve();
  assert.deepEqual(order, ['first start']);
  first.open();
  await Promise.all([running, queued]);
  assert.deepEqual(order, ['first start', 'first end', 'second']);
});

test('tasks with different names run at the same time', async () => {
  const first = gate();
  const running = paymentLock.exclusive('topUp:G1', () => first.opened);
  let otherRan = false;
  await paymentLock.exclusive('topUp:G2', async () => {
    otherRan = true;
  });
  assert.equal(otherRan, true);
  first.open();
  await running;
});

test('a failed task passes its error on and does not block the next one', async () => {
  const failed = paymentLock.exclusive('topUp:G3', async () => {
    throw new Error('withdraw refused');
  });
  await assert.rejects(failed, /withdraw refused/);
  assert.equal(await paymentLock.exclusive('topUp:G3', async () => 'paid'), 'paid');
});
