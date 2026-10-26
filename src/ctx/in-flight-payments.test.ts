import assert from 'node:assert/strict';
import { test } from 'node:test';

import { InFlightPayments } from './in-flight-payments.ts';

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('a second pay for the same payment while one is in flight is refused', async () => {
  const payments = new InFlightPayments();
  const first = deferred();
  let runs = 0;
  const task = async () => {
    runs += 1;
    await first.promise;
  };
  const running = payments.start('pay-1', task);
  assert.ok(running);
  assert.equal(payments.has('pay-1'), true);
  assert.equal(payments.start('pay-1', task), null);
  first.resolve();
  await running;
  assert.equal(runs, 1);
});

test('the payment is marked in flight before its task starts and cleared when it ends', async () => {
  const payments = new InFlightPayments();
  let seenInFlight = false;
  const running = payments.start('pay-1', async () => {
    seenInFlight = payments.has('pay-1');
  });
  await running;
  assert.equal(seenInFlight, true);
  assert.equal(payments.has('pay-1'), false);
  assert.ok(payments.start('pay-1', async () => {}));
});

test('a failed task clears the marker and settles quietly for a waiting screen', async () => {
  const payments = new InFlightPayments();
  const running = payments.start('pay-1', async () => {
    throw new Error('withdraw refused');
  });
  assert.ok(running);
  const waiting = payments.settled('pay-1');
  await assert.rejects(running, /withdraw refused/);
  await waiting;
  assert.equal(payments.has('pay-1'), false);
});

test('another payment can start while one is in flight', async () => {
  const payments = new InFlightPayments();
  const first = deferred();
  const running = payments.start('pay-1', () => first.promise);
  assert.ok(payments.start('pay-2', async () => {}));
  first.resolve();
  await running;
});
