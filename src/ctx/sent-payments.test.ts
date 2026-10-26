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
    async removeItem(key) {
      values.delete(key);
    },
    async getAllKeys() {
      return [...values.keys()];
    },
  };
}

const signed = { expiryLedger: 500, transfer: { amount: 25n } };

test('a payment is recorded before it is sent and survives a reload', async () => {
  const storage = memoryStorage();
  await new SentPayments(storage, () => 1).sending('pay-1', signed);
  assert.deepEqual(await new SentPayments(storage, () => 2).get('pay-1'), {
    expiryLedger: 500,
    transfer: { amount: 25n },
    at: 1,
  });
});

test('each payment is stored under its own key', async () => {
  const storage = memoryStorage();
  await new SentPayments(storage, () => 1).sending('pay-1', signed);
  assert.deepEqual([...storage.values.keys()], [SentPayments.keyOf('pay-1')]);
  assert.equal(SentPayments.keyOf('pay-1'), 'payments.sent.pay-1');
});

test('the signed muxed id is kept with the amount', async () => {
  const payments = new SentPayments(memoryStorage(), () => 1);
  await payments.sending('pay-1', { expiryLedger: 500, transfer: { amount: 25n, muxedId: 7n } });
  assert.deepEqual((await payments.get('pay-1'))?.transfer, { amount: 25n, muxedId: 7n });
});

test('the transaction id joins the record once the sponsor answers', async () => {
  const payments = new SentPayments(memoryStorage(), () => 1);
  await payments.sending('pay-1', signed);
  await payments.sent('pay-1', 'tx-1');
  assert.deepEqual(await payments.get('pay-1'), {
    expiryLedger: 500,
    txId: 'tx-1',
    transfer: { amount: 25n },
    at: 1,
  });
});

test('a transaction id without a recorded send is ignored', async () => {
  const payments = new SentPayments(memoryStorage(), () => 1);
  await payments.sent('pay-1', 'tx-1');
  assert.equal(await payments.get('pay-1'), null);
});

test('an already submitted payment keeps only the transaction id CTX reported', async () => {
  const payments = new SentPayments(memoryStorage(), () => 1);
  await payments.sending('pay-1', signed);
  await payments.alreadySubmitted('pay-1', 'tx-other');
  assert.deepEqual(await payments.get('pay-1'), { txId: 'tx-other', at: 1 });
  await payments.sending('pay-2', signed);
  await payments.alreadySubmitted('pay-2');
  assert.deepEqual(await payments.get('pay-2'), { at: 1 });
});

test('a forgotten payment has no record', async () => {
  const payments = new SentPayments(memoryStorage(), () => 1);
  await payments.sending('pay-1', signed);
  await payments.forget('pay-1');
  assert.equal(await payments.get('pay-1'), null);
});

test('writers sharing storage keep every record', async () => {
  const storage = memoryStorage();
  const tabA = new SentPayments(storage, () => 1);
  const tabB = new SentPayments(storage, () => 1);
  await Promise.all([tabA.sending('pay-1', signed), tabB.sending('pay-2', { ...signed, expiryLedger: 600 })]);
  await Promise.all([tabA.sent('pay-1', 'tx-1'), tabB.forget('pay-2'), tabA.sending('pay-3', signed)]);
  assert.equal((await tabB.get('pay-1'))?.txId, 'tx-1');
  assert.equal(await tabA.get('pay-2'), null);
  assert.notEqual(await tabB.get('pay-3'), null);
});

test('records older than the keep window are dropped', async () => {
  const storage = memoryStorage();
  storage.values.set('other.key', 'kept');
  await new SentPayments(storage, () => 0).sending('old', signed);
  const later = new SentPayments(storage, () => SentPayments.keepMs + 1);
  await later.sending('new', signed);
  assert.equal(await later.get('old'), null);
  assert.deepEqual([...storage.values.keys()].sort(), ['other.key', SentPayments.keyOf('new')]);
});

test('unreadable storage reads as no records', async () => {
  const storage = memoryStorage();
  storage.values.set(SentPayments.keyOf('pay-1'), '{not json');
  assert.equal(await new SentPayments(storage).get('pay-1'), null);
  storage.values.set(SentPayments.keyOf('pay-1'), JSON.stringify({ at: 'x' }));
  assert.equal(await new SentPayments(storage).get('pay-1'), null);
});
