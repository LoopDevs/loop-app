import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  canPay,
  chainOutcome,
  landingClosed,
  landingGraceLedgers,
  rateLimitedMessage,
  rejectedPaymentState,
  resumedPaymentState,
  sendFailureState,
  sentTransactionOutcome,
  transferAmount,
  transferLanded,
  transferMuxedId,
} from './payment-state.ts';

const unpaid = { status: 'unpaid' };
const sent = { status: 'unpaid', paymentCryptoTxId: 'abc' };

test('a resumed order with a sent payment is confirming', () => {
  assert.deepEqual(resumedPaymentState(sent), { kind: 'confirming', txId: 'abc' });
});

test('a resumed order this phone sent is confirming even before CTX shows the transaction', () => {
  assert.deepEqual(resumedPaymentState(unpaid, { expiryLedger: 500 }), {
    kind: 'confirming',
    txId: undefined,
    expiryLedger: 500,
  });
  assert.deepEqual(resumedPaymentState(unpaid, { expiryLedger: 500, txId: 'tx' }), {
    kind: 'confirming',
    txId: 'tx',
    expiryLedger: 500,
  });
  assert.equal(canPay(unpaid, resumedPaymentState(unpaid, { expiryLedger: 500 })), false);
});

test('the transaction CTX recorded wins over the one this phone recorded', () => {
  assert.deepEqual(resumedPaymentState(sent, { expiryLedger: 500, txId: 'other' }), { kind: 'confirming', txId: 'abc' });
});

test('a resumed order past unpaid is not confirming', () => {
  assert.deepEqual(resumedPaymentState({ status: 'paid' }, { expiryLedger: 500 }), { kind: 'ready' });
});

test('a sent transaction fails only once it can no longer land', () => {
  assert.equal(sentTransactionOutcome({ status: 'NOT_FOUND', latestLedger: 500 + landingGraceLedgers }, 500), 'pending');
  assert.equal(sentTransactionOutcome({ status: 'NOT_FOUND', latestLedger: 501 + landingGraceLedgers }, 500), 'failed');
  assert.equal(sentTransactionOutcome({ status: 'NOT_FOUND', latestLedger: 10_000 }), 'pending');
  assert.equal(sentTransactionOutcome({ status: 'FAILED', latestLedger: 400 }, 500), 'failed');
  assert.equal(sentTransactionOutcome({ status: 'SUCCESS', latestLedger: 10_000 }, 500), 'success');
});

test('a resumed order without a sent payment is ready', () => {
  assert.deepEqual(resumedPaymentState(unpaid), { kind: 'ready' });
  assert.deepEqual(resumedPaymentState({ status: 'paid' }), { kind: 'ready' });
});

test('an already submitted payment is confirming with its transaction', () => {
  assert.deepEqual(rejectedPaymentState({ status: 409, errorName: 'ErrPaymentAlreadySubmitted', txId: 'abc' }), {
    kind: 'confirming',
    txId: 'abc',
  });
});

test('a closed payment is an expired price', () => {
  assert.deepEqual(rejectedPaymentState({ status: 400, message: 'payment is no longer open' }), {
    kind: 'priceExpired',
  });
});

test('another bad request keeps the order payable with the detail', () => {
  assert.deepEqual(rejectedPaymentState({ status: 400, message: 'insufficient balance' }), {
    kind: 'notSent',
    detail: 'insufficient balance',
  });
});

test('a rate-limited payment was not sent and stays payable', () => {
  const rateLimited = { kind: 'notSent', detail: rateLimitedMessage } as const;
  assert.deepEqual(rejectedPaymentState({ status: 429 }), rateLimited);
  assert.deepEqual(sendFailureState(true, { status: 429 }), rateLimited);
  assert.equal(canPay(unpaid, rateLimited), true);
});

test('other rejections are not payment states', () => {
  assert.equal(rejectedPaymentState({ status: 409, errorName: 'ErrConflict' }), null);
  assert.equal(rejectedPaymentState({ status: 500 }), null);
});

test('a payment that reached the sponsor with an unknown outcome is confirming', () => {
  assert.deepEqual(sendFailureState(true), { kind: 'confirming' });
  assert.deepEqual(sendFailureState(true, { status: 500 }), { kind: 'confirming' });
});

test('a rejected payment takes its rejection state wherever it failed', () => {
  assert.deepEqual(sendFailureState(true, { status: 400, message: 'payment is no longer open' }), {
    kind: 'priceExpired',
  });
  assert.deepEqual(sendFailureState(false, { status: 400, message: 'bad amount' }), {
    kind: 'notSent',
    detail: 'bad amount',
  });
});

test('a payment that failed before sending has no payment state', () => {
  assert.equal(sendFailureState(false), null);
  assert.equal(sendFailureState(false, { status: 500 }), null);
});

test('chain statuses map to payment outcomes', () => {
  assert.equal(chainOutcome('SUCCESS'), 'success');
  assert.equal(chainOutcome('FAILED'), 'failed');
  assert.equal(chainOutcome('NOT_FOUND'), 'pending');
});

test('pay is only offered for an unpaid order with no sent payment', () => {
  assert.equal(canPay(unpaid, { kind: 'ready' }), true);
  assert.equal(canPay(unpaid, { kind: 'notSent', detail: '' }), true);
  assert.equal(canPay(sent, { kind: 'ready' }), false);
  assert.equal(canPay(unpaid, { kind: 'sending' }), false);
  assert.equal(canPay(unpaid, { kind: 'confirming' }), false);
  assert.equal(canPay(unpaid, { kind: 'failed' }), false);
  assert.equal(canPay(unpaid, { kind: 'priceExpired' }), false);
  assert.equal(canPay({ status: 'paid' }, { kind: 'ready' }), false);
});

test('landing closes once the grace ledgers after expiry have passed', () => {
  assert.equal(landingClosed(500 + landingGraceLedgers, 500), false);
  assert.equal(landingClosed(501 + landingGraceLedgers, 500), true);
});

test('a transfer amount is read from a plain amount or a muxed transfer map', () => {
  assert.equal(transferAmount(25n), 25n);
  assert.equal(transferAmount({ amount: 25n, to_muxed_id: 7n }), 25n);
  assert.equal(transferAmount({ amount: '25' }), null);
  assert.equal(transferAmount('25'), null);
  assert.equal(transferAmount(null), null);
});

test('a transfer has landed when one matches the signed amount', () => {
  assert.equal(transferLanded([10n, { amount: 25n }], { amount: 25n }), true);
  assert.equal(transferLanded([10n], { amount: 25n }), false);
  assert.equal(transferLanded([], { amount: 25n }), false);
  assert.equal(transferLanded(['junk'], null), false);
  assert.equal(transferLanded([10n], null), true);
});

test('a transfer to a muxed payee lands only with the signed muxed id', () => {
  const signed = { amount: 25n, muxedId: 7n };
  assert.equal(transferLanded([{ amount: 25n, to_muxed_id: 7n }], signed), true);
  assert.equal(transferLanded([{ amount: 25n, to_muxed_id: 8n }], signed), false);
  assert.equal(transferLanded([25n], signed), false);
  assert.equal(transferMuxedId({ amount: 25n, to_muxed_id: 7n }), 7n);
  assert.equal(transferMuxedId(25n), null);
});
