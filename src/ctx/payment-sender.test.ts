import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PaymentSender, type SignedPayment } from './payment-sender.ts';
import { SentPayments, type SentPaymentStorage } from './sent-payments.ts';

function memoryStorage(): SentPaymentStorage {
  const values = new Map<string, string>();
  return {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
  };
}

type Rejection = { status: number; message?: string };

class Rejected extends Error {
  readonly rejection: Rejection;

  constructor(rejection: Rejection) {
    super('rejected');
    this.rejection = rejection;
  }
}

function sender(records: SentPayments): PaymentSender {
  return new PaymentSender(records, (error) => (error instanceof Rejected ? error.rejection : undefined));
}

function signed(sponsor: SignedPayment['sponsor']): SignedPayment {
  return { expiryLedger: 500, sponsor };
}

test('a payment already recorded on this device is not signed or sponsored again', async () => {
  const records = new SentPayments(memoryStorage(), () => 1);
  await records.sending('pay-1', 400);
  let signs = 0;
  const state = await sender(records).send('pay-1', async () => {
    signs += 1;
    return signed(async () => ({ hash: 'tx' }));
  });
  assert.equal(signs, 0);
  assert.deepEqual(state, { kind: 'confirming', txId: undefined, expiryLedger: 400 });
});

test('the payment is recorded before it reaches the sponsor', async () => {
  const records = new SentPayments(memoryStorage(), () => 1);
  let recordedAtSponsor: unknown = null;
  const state = await sender(records).send('pay-1', async () =>
    signed(async () => {
      recordedAtSponsor = await records.get('pay-1');
      return { hash: 'tx-1' };
    }),
  );
  assert.deepEqual(recordedAtSponsor, { expiryLedger: 500, at: 1 });
  assert.deepEqual(state, { kind: 'confirming', txId: 'tx-1', expiryLedger: 500 });
  assert.deepEqual(await records.get('pay-1'), { expiryLedger: 500, txId: 'tx-1', at: 1 });
});

test('a recorded payment reads as confirming', async () => {
  const records = new SentPayments(memoryStorage(), () => 1);
  assert.equal(await sender(records).recorded('pay-1'), null);
  await records.sending('pay-1', 400);
  assert.deepEqual(await sender(records).recorded('pay-1'), {
    kind: 'confirming',
    txId: undefined,
    expiryLedger: 400,
  });
});

test('a sponsor error is a failed payment', async () => {
  const records = new SentPayments(memoryStorage(), () => 1);
  const state = await sender(records).send('pay-1', async () =>
    signed(async () => ({ hash: 'tx-1', error: 'tx_failed' })),
  );
  assert.deepEqual(state, { kind: 'failed' });
});

test('an unknown outcome after the sponsor call stays confirming and recorded', async () => {
  const records = new SentPayments(memoryStorage(), () => 1);
  const state = await sender(records).send('pay-1', async () =>
    signed(async () => {
      throw new Error('network down');
    }),
  );
  assert.deepEqual(state, { kind: 'confirming', expiryLedger: 500 });
  assert.notEqual(await records.get('pay-1'), null);
});

test('a rejected payment is forgotten so it can be paid again', async () => {
  const records = new SentPayments(memoryStorage(), () => 1);
  const state = await sender(records).send('pay-1', async () =>
    signed(async () => {
      throw new Rejected({ status: 400, message: 'payment is no longer open' });
    }),
  );
  assert.deepEqual(state, { kind: 'priceExpired' });
  assert.equal(await records.get('pay-1'), null);
});

test('a failure before signing completes rethrows and records nothing', async () => {
  const records = new SentPayments(memoryStorage(), () => 1);
  await assert.rejects(
    sender(records).send('pay-1', async () => {
      throw new Error('passkey cancelled');
    }),
    /passkey cancelled/,
  );
  assert.equal(await records.get('pay-1'), null);
});
