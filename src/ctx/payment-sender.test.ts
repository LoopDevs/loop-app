import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PaymentSender, type PaymentLock, type SignedPayment } from './payment-sender.ts';
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
    async removeItem(key) {
      values.delete(key);
    },
    async getAllKeys() {
      return [...values.keys()];
    },
  };
}

class MemoryLock implements PaymentLock {
  readonly names: string[] = [];
  private readonly tails = new Map<string, Promise<unknown>>();

  exclusive<T>(name: string, task: () => Promise<T>): Promise<T> {
    this.names.push(name);
    const run = (this.tails.get(name) ?? Promise.resolve()).then(task);
    this.tails.set(
      name,
      run.catch(() => undefined),
    );
    return run;
  }
}

const noLock: PaymentLock = {
  exclusive: (_name, task) => task(),
};

type Rejection = { status: number; errorName?: string; message?: string; txId?: string };

class Rejected extends Error {
  readonly rejection: Rejection;

  constructor(rejection: Rejection) {
    super('rejected');
    this.rejection = rejection;
  }
}

function sender(records: SentPayments, lock: PaymentLock = noLock): PaymentSender {
  return new PaymentSender(records, (error) => (error instanceof Rejected ? error.rejection : undefined), lock);
}

function signed(sponsor: SignedPayment['sponsor']): SignedPayment {
  return { expiryLedger: 500, transfer: { amount: 25n }, sponsor };
}

test('a payment already recorded on this device is not signed or sponsored again', async () => {
  const records = new SentPayments(memoryStorage(), () => 1);
  await records.sending('pay-1', { expiryLedger: 400, transfer: { amount: 25n } });
  let signs = 0;
  const outcome = await sender(records).send('pay-1', async () => {
    signs += 1;
    return signed(async () => ({ hash: 'tx' }));
  });
  assert.equal(signs, 0);
  assert.deepEqual(outcome, {
    state: { kind: 'confirming', txId: undefined, expiryLedger: 400 },
    resumed: true,
  });
});

test('two tabs paying the same order at once sign and sponsor it once', async () => {
  const storage = memoryStorage();
  const lock = new MemoryLock();
  let signs = 0;
  let sponsors = 0;
  const pay = () =>
    sender(new SentPayments(storage, () => 1), lock).send('pay-1', async () => {
      signs += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return signed(async () => {
        sponsors += 1;
        return { hash: 'tx-1' };
      });
    });
  const outcomes = await Promise.all([pay(), pay()]);
  assert.equal(signs, 1);
  assert.equal(sponsors, 1);
  assert.deepEqual(
    outcomes.map((outcome) => outcome.resumed),
    [false, true],
  );
  assert.deepEqual(lock.names, ['pay:pay-1', 'pay:pay-1']);
});

test('the payment is recorded before it reaches the sponsor', async () => {
  const records = new SentPayments(memoryStorage(), () => 1);
  let recordedAtSponsor: unknown = null;
  const outcome = await sender(records).send('pay-1', async () =>
    signed(async () => {
      recordedAtSponsor = await records.get('pay-1');
      return { hash: 'tx-1' };
    }),
  );
  assert.deepEqual(recordedAtSponsor, { expiryLedger: 500, transfer: { amount: 25n }, at: 1 });
  assert.deepEqual(outcome, { state: { kind: 'confirming', txId: 'tx-1', expiryLedger: 500 }, resumed: false });
  assert.equal((await records.get('pay-1'))?.txId, 'tx-1');
});

test('a recorded payment reads as confirming', async () => {
  const records = new SentPayments(memoryStorage(), () => 1);
  assert.equal(await sender(records).recorded('pay-1'), null);
  await records.sending('pay-1', { expiryLedger: 400, transfer: { amount: 25n } });
  assert.deepEqual(await sender(records).recorded('pay-1'), {
    kind: 'confirming',
    txId: undefined,
    expiryLedger: 400,
  });
});

test('a sponsor error is a failed payment', async () => {
  const records = new SentPayments(memoryStorage(), () => 1);
  const outcome = await sender(records).send('pay-1', async () =>
    signed(async () => ({ hash: 'tx-1', error: 'tx_failed' })),
  );
  assert.deepEqual(outcome.state, { kind: 'failed' });
});

test('an unknown outcome after the sponsor call stays confirming and recorded', async () => {
  const records = new SentPayments(memoryStorage(), () => 1);
  const outcome = await sender(records).send('pay-1', async () =>
    signed(async () => {
      throw new Error('network down');
    }),
  );
  assert.deepEqual(outcome.state, { kind: 'confirming', expiryLedger: 500 });
  assert.notEqual(await records.get('pay-1'), null);
});

test('an already submitted payment confirms without this attempt expiry', async () => {
  const records = new SentPayments(memoryStorage(), () => 1);
  const outcome = await sender(records).send('pay-1', async () =>
    signed(async () => {
      throw new Rejected({ status: 409, errorName: 'ErrPaymentAlreadySubmitted', txId: 'tx-other' });
    }),
  );
  assert.deepEqual(outcome.state, { kind: 'confirming', txId: 'tx-other' });
  assert.deepEqual(await records.get('pay-1'), { txId: 'tx-other', at: 1 });
});

test('a payment CTX calls no longer open is forgotten, as CTX refuses it before submitting the transaction', async () => {
  const records = new SentPayments(memoryStorage(), () => 1);
  const outcome = await sender(records).send('pay-1', async () =>
    signed(async () => {
      throw new Rejected({ status: 400, message: 'payment is no longer open' });
    }),
  );
  assert.deepEqual(outcome.state, { kind: 'priceExpired' });
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
