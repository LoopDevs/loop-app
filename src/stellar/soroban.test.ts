import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { rpc } from '@stellar/stellar-sdk';

import { Soroban } from './soroban.ts';

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
