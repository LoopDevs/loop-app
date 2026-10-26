import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SentPayments, type SentPaymentStorage } from './sent-payments.ts';

function memoryStorage(): SentPaymentStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
  };
}

test('a payment is recorded before it is sent and survives a reload', async () => {
  const storage = memoryStorage();
  await new SentPayments(storage, () => 1).sending('pay-1', 500);
  assert.deepEqual(await new SentPayments(storage, () => 2).get('pay-1'), { expiryLedger: 500, at: 1 });
});

test('the transaction id joins the record once the sponsor answers', async () => {
  const payments = new SentPayments(memoryStorage(), () => 1);
  await payments.sending('pay-1', 500);
  await payments.sent('pay-1', 'tx-1');
  assert.deepEqual(await payments.get('pay-1'), { expiryLedger: 500, txId: 'tx-1', at: 1 });
});

test('a transaction id without a recorded send is ignored', async () => {
  const payments = new SentPayments(memoryStorage(), () => 1);
  await payments.sent('pay-1', 'tx-1');
  assert.equal(await payments.get('pay-1'), null);
});

test('a forgotten payment has no record', async () => {
  const payments = new SentPayments(memoryStorage(), () => 1);
  await payments.sending('pay-1', 500);
  await payments.forget('pay-1');
  assert.equal(await payments.get('pay-1'), null);
});

test('concurrent writes keep every record', async () => {
  const payments = new SentPayments(memoryStorage(), () => 1);
  await Promise.all([payments.sending('pay-1', 500), payments.sending('pay-2', 600)]);
  await Promise.all([payments.sent('pay-1', 'tx-1'), payments.forget('pay-2'), payments.sending('pay-3', 700)]);
  assert.deepEqual(await payments.get('pay-1'), { expiryLedger: 500, txId: 'tx-1', at: 1 });
  assert.equal(await payments.get('pay-2'), null);
  assert.deepEqual(await payments.get('pay-3'), { expiryLedger: 700, at: 1 });
});

test('a failed write does not block later writes', async () => {
  const storage = memoryStorage();
  let failNext = true;
  const flaky: SentPaymentStorage = {
    getItem: (key) => storage.getItem(key),
    async setItem(key, value) {
      if (failNext) {
        failNext = false;
        throw new Error('disk full');
      }
      await storage.setItem(key, value);
    },
  };
  const payments = new SentPayments(flaky, () => 1);
  await assert.rejects(payments.sending('pay-1', 500), /disk full/);
  await payments.sending('pay-2', 600);
  assert.deepEqual(await payments.get('pay-2'), { expiryLedger: 600, at: 1 });
});

test('records older than the keep window are dropped', async () => {
  const storage = memoryStorage();
  await new SentPayments(storage, () => 0).sending('old', 500);
  const later = new SentPayments(storage, () => SentPayments.keepMs + 1);
  await later.sending('new', 600);
  assert.equal(await later.get('old'), null);
  assert.deepEqual(Object.keys(JSON.parse(storage.values.get(SentPayments.storageKey) ?? '{}')), ['new']);
});

test('unreadable storage reads as no records', async () => {
  const storage = memoryStorage();
  storage.values.set(SentPayments.storageKey, '{not json');
  assert.equal(await new SentPayments(storage).get('pay-1'), null);
  storage.values.set(SentPayments.storageKey, JSON.stringify({ 'pay-1': { at: 'x' } }));
  assert.equal(await new SentPayments(storage).get('pay-1'), null);
});
