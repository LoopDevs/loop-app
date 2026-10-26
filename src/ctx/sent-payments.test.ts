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

test('a forgotten payment is no longer recorded', async () => {
  const payments = new SentPayments(memoryStorage(), () => 1);
  await payments.sending('pay-1', 500);
  await payments.forget('pay-1');
  assert.equal(await payments.get('pay-1'), null);
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
