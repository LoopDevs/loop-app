import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Address, nativeToScVal, type rpc, type Transaction } from '@stellar/stellar-sdk';

import { LedgerProgress, Soroban } from './soroban.ts';
import { TransferEvents } from './transfer-events.ts';

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

const token = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const owner = 'GAYHOZUORLQYLH6N5BX56TXEOIGJCITMZPLFUS7GUEZEIITDQP224LNG';
const payee = 'CCNMXHVK6ODB6GY3Z3ZU5K3RFN5NJ6AQLTVGXUNWTCFVHLACIR2BLLHZ';

function sorobanWith(server: Partial<rpc.Server>): Soroban {
  return new Soroban([server as rpc.Server]);
}

function invocation(transaction: Transaction) {
  const operation = transaction.operations[0];
  if (operation.type !== 'invokeHostFunction') {
    throw new Error('expected an invoke operation');
  }
  if (operation.func.type !== 'hostFunctionTypeInvokeContract') {
    throw new Error('expected a contract call');
  }
  return operation.func.invokeContract;
}

test('retention returns only the oldest and latest ledger of the endpoint health', async () => {
  const soroban = sorobanWith({
    getHealth: async () => ({ status: 'healthy', oldestLedger: 10, latestLedger: 90, ledgerRetentionWindow: 80 }),
  });

  assert.deepEqual(await soroban.retention(), { oldestLedger: 10, latestLedger: 90 });
});

test('a transaction lookup passes the hash and returns only status and latest ledger', async () => {
  const hashes: string[] = [];
  const soroban = sorobanWith({
    getTransaction: (async (hash: string) => {
      hashes.push(hash);
      return { status: 'SUCCESS', latestLedger: 77, ledger: 70 };
    }) as unknown as rpc.Server['getTransaction'],
  });

  assert.deepEqual(await soroban.transaction('abc'), { status: 'SUCCESS', latestLedger: 77 });
  assert.deepEqual(hashes, ['abc']);
});

test('a contract read simulates the named method and returns the native result', async () => {
  const simulated: Transaction[] = [];
  const soroban = sorobanWith({
    simulateTransaction: (async (transaction: Transaction) => {
      simulated.push(transaction);
      return { result: { retval: nativeToScVal(5n, { type: 'i128' }) } };
    }) as unknown as rpc.Server['simulateTransaction'],
  });

  assert.equal(await soroban.read(token, 'decimals'), 5n);
  assert.equal(simulated.length, 1);
  assert.equal(invocation(simulated[0]).functionName.toString(), 'decimals');
  assert.equal(Address.fromScAddress(invocation(simulated[0]).contractAddress).toString(), token);
});

test('a contract read that the simulation rejects names the method and the reason', async () => {
  const soroban = sorobanWith({
    simulateTransaction: (async () => ({ error: 'HostError: boom' })) as unknown as rpc.Server['simulateTransaction'],
  });

  await assert.rejects(soroban.read(token, 'decimals'), /decimals failed: HostError: boom/);
});

test('a contract read without a result is undefined', async () => {
  const soroban = sorobanWith({
    simulateTransaction: (async () => ({})) as unknown as rpc.Server['simulateTransaction'],
  });

  assert.equal(await soroban.read(token, 'decimals'), undefined);
});

test('a balance read calls balance with the owner address', async () => {
  const simulated: Transaction[] = [];
  const soroban = sorobanWith({
    simulateTransaction: (async (transaction: Transaction) => {
      simulated.push(transaction);
      return { result: { retval: nativeToScVal(250n, { type: 'i128' }) } };
    }) as unknown as rpc.Server['simulateTransaction'],
  });

  assert.equal(await soroban.balance(token, owner), 250n);
  const call = invocation(simulated[0]);
  assert.equal(call.functionName.toString(), 'balance');
  assert.deepEqual(
    call.args.map((arg) => arg.toXDR('base64')),
    [new Address(owner).toScVal().toXDR('base64')],
  );
});

test('transfers asks for the transfer events in the range and maps each event', async () => {
  const requests: rpc.Api.GetEventsRequest[] = [];
  const soroban = sorobanWith({
    getEvents: (async (request: rpc.Api.GetEventsRequest) => {
      requests.push(request);
      return {
        latestLedger: 9,
        events: [
          { value: nativeToScVal(7n, { type: 'i128' }), txHash: 'h1', ledgerClosedAt: '2026-01-01T00:00:00Z' },
          { value: nativeToScVal(8n, { type: 'i128' }), txHash: 'h2', ledgerClosedAt: '2026-01-02T00:00:00Z' },
        ],
      };
    }) as unknown as rpc.Server['getEvents'],
  });
  const ledgers = { startLedger: 5, endLedger: 9 };

  assert.deepEqual(await soroban.transfers(token, owner, payee, ledgers), {
    latestLedger: 9,
    transfers: [
      { value: 7n, txHash: 'h1', closedAt: Date.parse('2026-01-01T00:00:00Z') },
      { value: 8n, txHash: 'h2', closedAt: Date.parse('2026-01-02T00:00:00Z') },
    ],
  });
  assert.deepEqual(requests, [TransferEvents.request(token, owner, payee, ledgers)]);
});

function instanceEntry(executable: unknown, valueType = 'scvContractInstance', entryType = 'contractData') {
  return {
    val: { type: entryType, contractData: { val: { type: valueType, instance: { executable } } } },
  };
}

function ledgerEntries(...entries: unknown[]): Partial<rpc.Server> {
  return {
    getLedgerEntries: (async () => ({ entries })) as unknown as rpc.Server['getLedgerEntries'],
  };
}

test('a wasm contract reports its wasm hash as hex', async () => {
  const wasmHash = { value: new Uint8Array([0xab, 0xcd, 0x01]) };
  const soroban = sorobanWith(ledgerEntries(instanceEntry({ type: 'contractExecutableWasm', wasmHash })));

  assert.equal(await soroban.wasmHash(token), 'abcd01');
});

test('a contract with no ledger entry does not exist', async () => {
  await assert.rejects(sorobanWith(ledgerEntries()).wasmHash(token), /does not exist/);
});

test('a ledger entry that is not contract data has no instance', async () => {
  const soroban = sorobanWith(ledgerEntries(instanceEntry({}, 'scvContractInstance', 'account')));

  await assert.rejects(soroban.wasmHash(token), /has no instance/);
});

test('contract data that is not an instance has no instance', async () => {
  const soroban = sorobanWith(ledgerEntries(instanceEntry({}, 'scvVoid')));

  await assert.rejects(soroban.wasmHash(token), /has no instance/);
});

test('a contract that is not backed by wasm is refused', async () => {
  const soroban = sorobanWith(ledgerEntries(instanceEntry({ type: 'contractExecutableStellarAsset' })));

  await assert.rejects(soroban.wasmHash(token), /is not a wasm contract/);
});
