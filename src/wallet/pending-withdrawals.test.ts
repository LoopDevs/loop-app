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
  await new PendingWithdrawals(storage).set('GW', 'XLM.USDC', withdrawal);
  assert.deepEqual(await new PendingWithdrawals(storage).get('GW', 'XLM.USDC'), withdrawal);
});

test('a deleted withdrawal is gone after a restart', async () => {
  const storage = memoryStorage();
  const pending = new PendingWithdrawals(storage);
  await pending.set('GW', 'XLM.USDC', withdrawal);
  await pending.delete('GW', 'XLM.USDC');
  assert.equal(await pending.get('GW', 'XLM.USDC'), undefined);
  assert.equal(await new PendingWithdrawals(storage).get('GW', 'XLM.USDC'), undefined);
});

test('a withdrawal saved by another tab replaces the one this tab read', async () => {
  const storage = memoryStorage();
  const thisTab = new PendingWithdrawals(storage);
  await thisTab.set('GW', 'XLM.USDC', withdrawal);
  const newer = { hash: 'def', expiryLedger: 900 };
  await new PendingWithdrawals(storage).set('GW', 'XLM.USDC', newer);
  assert.deepEqual(await thisTab.get('GW', 'XLM.USDC'), newer);
});

test('a withdrawal whose save failed is still known to this tab', async () => {
  const storage = memoryStorage();
  const pending = new PendingWithdrawals(storage);
  await pending.set('GW', 'XLM.USDC', withdrawal);
  storage.setItem = async () => {
    throw new Error('storage full');
  };
  const newer = { hash: 'def', expiryLedger: 900 };
  await assert.rejects(pending.set('GW', 'XLM.USDC', newer), /storage full/);
  assert.deepEqual(await pending.get('GW', 'XLM.USDC'), newer);
});

test('withdrawals are kept per wallet address', async () => {
  const pending = new PendingWithdrawals(memoryStorage());
  await pending.set('GW', 'XLM.USDC', withdrawal);
  assert.equal(await pending.get('GX', 'XLM.USDC'), undefined);
});

test('withdrawals are kept per savings currency', async () => {
  const pending = new PendingWithdrawals(memoryStorage());
  await pending.set('GW', 'XLM.USDC', withdrawal);
  assert.equal(await pending.get('GW', 'XLM.GBPLOOP'), undefined);
  await pending.delete('GW', 'XLM.GBPLOOP');
  assert.deepEqual(await pending.get('GW', 'XLM.USDC'), withdrawal);
});

test('a malformed stored withdrawal reads as none', async () => {
  const storage = memoryStorage();
  storage.values.set(PendingWithdrawals.keyOf('GW', 'XLM.USDC'), '{"hash":1}');
  storage.values.set(PendingWithdrawals.keyOf('GX', 'XLM.USDC'), 'not json');
  const pending = new PendingWithdrawals(storage);
  assert.equal(await pending.get('GW', 'XLM.USDC'), undefined);
  assert.equal(await pending.get('GX', 'XLM.USDC'), undefined);
});
