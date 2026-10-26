import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { SignedTransfer } from '../ctx/payment-state.ts';
import type { Token } from '../stellar/network.ts';
import { SentPaymentCheck, type PaymentChain } from './sent-payment-check.ts';

const token = { currency: 'XLM.GBPLOOP' } as Token;
const payable = { paymentId: 'pay_1', paymentCryptoCurrency: 'XLM.GBPLOOP', paymentCryptoAmount: '25.0000000' };

function chain(landed: boolean, seen: (SignedTransfer | null)[]): PaymentChain {
  return {
    tokens: [token],
    transaction: async () => ({ status: 'NOT_FOUND', latestLedger: 1 }),
    latestLedger: async () => 10_000,
    landed: async (_token, expected) => {
      seen.push(expected);
      return landed;
    },
  };
}

test('a recorded transfer is what the landing check looks for', async () => {
  const seen: (SignedTransfer | null)[] = [];
  const transfer = { amount: 7n };
  const failure = await new SentPaymentCheck(chain(false, seen)).failure(payable, { expiryLedger: 100, transfer });
  assert.deepEqual(failure, { kind: 'failed', contactSupport: true });
  assert.deepEqual(seen, [transfer]);
});

test('without a recorded transfer the check falls back to the price', async () => {
  const seen: (SignedTransfer | null)[] = [];
  const failure = await new SentPaymentCheck(chain(true, seen)).failure(payable, { expiryLedger: 100 });
  assert.equal(failure, null);
  assert.deepEqual(seen, [{ amount: 250_000_000n }]);
});

test('nothing is judged before the landing window closes', async () => {
  const seen: (SignedTransfer | null)[] = [];
  const failure = await new SentPaymentCheck(chain(false, seen)).failure(payable, { expiryLedger: 9_999 });
  assert.equal(failure, null);
  assert.deepEqual(seen, []);
});
