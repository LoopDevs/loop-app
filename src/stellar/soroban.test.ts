import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { rpc } from '@stellar/stellar-sdk';

import { LedgerProgress, Soroban } from './soroban.ts';

function fakeServer(latestLedger: () => Promise<{ sequence: number }>, calls: string[], name: string): rpc.Server {
  return {
    getLatestLedger: () => {
      calls.push(name);
      return latestLedger();
    },
  } as unknown as rpc.Server;
}

test('a transport failure on the primary endpoint is answered by the fallback, which stays preferred', async () => {
  const calls: string[] = [];
  const soroban = new Soroban([
    fakeServer(() => Promise.reject(new Error('Network Error')), calls, 'primary'),
    fakeServer(() => Promise.resolve({ sequence: 42 }), calls, 'fallback'),
  ]);

  assert.equal(await soroban.latestLedger(), 42);
  assert.equal(await soroban.latestLedger(), 42);
  assert.deepEqual(calls, ['primary', 'fallback', 'fallback']);
});

test('an error answered by the endpoint is raised without trying the fallback', async () => {
  const calls: string[] = [];
  const rpcError = { code: -32602, message: 'invalid parameters' };
  const soroban = new Soroban([
    fakeServer(() => Promise.reject(rpcError), calls, 'primary'),
    fakeServer(() => Promise.resolve({ sequence: 42 }), calls, 'fallback'),
  ]);

  await assert.rejects(soroban.latestLedger(), (error) => error === rpcError);
  assert.deepEqual(calls, ['primary']);
});

test('the last transport failure is raised when every endpoint fails', async () => {
  const calls: string[] = [];
  const soroban = new Soroban([
    fakeServer(() => Promise.reject(new Error('timeout of 30000ms exceeded')), calls, 'primary'),
    fakeServer(() => Promise.reject(new Error('Network Error')), calls, 'fallback'),
  ]);

  await assert.rejects(soroban.latestLedger(), /Network Error/);
  assert.deepEqual(calls, ['primary', 'fallback']);
});

test('a slow endpoint is hedged with the next one, whose answer wins and makes it preferred', async () => {
  const calls: string[] = [];
  const soroban = new Soroban(
    [
      fakeServer(() => new Promise(() => undefined), calls, 'primary'),
      fakeServer(() => Promise.resolve({ sequence: 42 }), calls, 'fallback'),
    ],
    5,
  );

  assert.equal(await soroban.latestLedger(), 42);
  assert.equal(await soroban.latestLedger(), 42);
  assert.deepEqual(calls, ['primary', 'fallback', 'fallback']);
});

test('an endpoint that answers within the hedge delay is not hedged', async () => {
  const calls: string[] = [];
  const soroban = new Soroban(
    [
      fakeServer(() => Promise.resolve({ sequence: 42 }), calls, 'primary'),
      fakeServer(() => Promise.resolve({ sequence: 43 }), calls, 'fallback'),
    ],
    5,
  );

  assert.equal(await soroban.latestLedger(), 42);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(calls, ['primary']);
});

test('a failing hedge does not discard the answer the slow endpoint still gives', async () => {
  const calls: string[] = [];
  const soroban = new Soroban(
    [
      fakeServer(() => new Promise((resolve) => setTimeout(() => resolve({ sequence: 42 }), 15)), calls, 'primary'),
      fakeServer(() => Promise.reject(new Error('Network Error')), calls, 'fallback'),
    ],
    5,
  );

  assert.equal(await soroban.latestLedger(), 42);
  assert.deepEqual(calls, ['primary', 'fallback']);
});

test('an endpoint whose ledger stops advancing loses to the next one, which becomes preferred', async () => {
  const calls: string[] = [];
  let now = 0;
  let fallbackLedger = 100;
  const soroban = new Soroban(
    [
      fakeServer(() => Promise.resolve({ sequence: 42 }), calls, 'primary'),
      fakeServer(() => Promise.resolve({ sequence: (fallbackLedger += 1) }), calls, 'fallback'),
    ],
    Soroban.hedgeMs,
    () => now,
  );

  assert.equal(await soroban.latestLedger(), 42);
  now += LedgerProgress.stalledAfterMs + 1;
  assert.equal(await soroban.latestLedger(), 101);
  assert.equal(await soroban.latestLedger(), 102);
  assert.deepEqual(calls, ['primary', 'primary', 'fallback', 'fallback']);
});

test('a stalled answer is used when no other endpoint answers', async () => {
  const calls: string[] = [];
  let now = 0;
  const soroban = new Soroban(
    [
      fakeServer(() => Promise.resolve({ sequence: 42 }), calls, 'primary'),
      fakeServer(() => Promise.reject(new Error('Network Error')), calls, 'fallback'),
    ],
    Soroban.hedgeMs,
    () => now,
  );

  assert.equal(await soroban.latestLedger(), 42);
  now += LedgerProgress.stalledAfterMs + 1;
  assert.equal(await soroban.latestLedger(), 42);
});

test('a single endpoint is never treated as stalled', async () => {
  let now = 0;
  const soroban = new Soroban([fakeServer(() => Promise.resolve({ sequence: 42 }), [], 'only')], Soroban.hedgeMs, () => now);

  assert.equal(await soroban.latestLedger(), 42);
  now += LedgerProgress.stalledAfterMs + 1;
  assert.equal(await soroban.latestLedger(), 42);
});
