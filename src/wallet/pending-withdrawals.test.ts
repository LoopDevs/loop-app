import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PendingWithdrawals, type PendingWithdrawalStorage } from './pending-withdrawals.ts';

function memoryStorage(): PendingWithdrawalStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
  };
}

const withdrawal = { hash: 'abc', expiryLedger: 500 };

test('a pending withdrawal survives a restart', async () => {
  const storage = memoryStorage();
  await new PendingWithdrawals(storage).set('GW', withdrawal);
  assert.deepEqual(await new PendingWithdrawals(storage).get('GW'), withdrawal);
});

test('a deleted withdrawal is gone after a restart', async () => {
  const storage = memoryStorage();
  const pending = new PendingWithdrawals(storage);
  await pending.set('GW', withdrawal);
  await pending.delete('GW');
  assert.equal(await pending.get('GW'), undefined);
  assert.equal(await new PendingWithdrawals(storage).get('GW'), undefined);
});

test('a withdrawal saved by another tab replaces the one this tab read', async () => {
  const storage = memoryStorage();
  const thisTab = new PendingWithdrawals(storage);
  await thisTab.set('GW', withdrawal);
  const newer = { hash: 'def', expiryLedger: 900 };
  await new PendingWithdrawals(storage).set('GW', newer);
  assert.deepEqual(await thisTab.get('GW'), newer);
});

test('a withdrawal whose save failed is still known to this tab', async () => {
  const storage = memoryStorage();
  const pending = new PendingWithdrawals(storage);
  await pending.set('GW', withdrawal);
  storage.setItem = async () => {
    throw new Error('storage full');
  };
  const newer = { hash: 'def', expiryLedger: 900 };
  await assert.rejects(pending.set('GW', newer), /storage full/);
  assert.deepEqual(await pending.get('GW'), newer);
});

test('withdrawals are kept per wallet address', async () => {
  const pending = new PendingWithdrawals(memoryStorage());
  await pending.set('GW', withdrawal);
  assert.equal(await pending.get('GX'), undefined);
});

test('a malformed stored withdrawal reads as none', async () => {
  const storage = memoryStorage();
  storage.values.set(PendingWithdrawals.keyOf('GW'), '{"hash":1}');
  storage.values.set(PendingWithdrawals.keyOf('GX'), 'not json');
  const pending = new PendingWithdrawals(storage);
  assert.equal(await pending.get('GW'), undefined);
  assert.equal(await pending.get('GX'), undefined);
});
