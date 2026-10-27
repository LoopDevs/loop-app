import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CtxResponse, UnexpectedResponse } from './ctx-response.ts';

const giftCard = {
  id: 'gc-1',
  status: 'unpaid',
  merchantId: 'm-1',
  merchantName: 'Aerie',
  created: '2026-10-27T12:00:00Z',
  cardFiatAmount: '25.00',
  cardFiatCurrency: 'USD',
  paymentId: 'p-1',
  paymentStatus: 'unpaid',
  paymentMethod: 'crypto',
  paymentCryptoAmount: '24.5',
  paymentCryptoCurrency: 'XLM.USDC',
  paymentCryptoAddress: 'MADDRESS',
};

const unreported = (detail: string) => assert.fail(detail);
const unexpected = (detail: RegExp) => (error: unknown) =>
  error instanceof UnexpectedResponse && detail.test(error.detail);

test('a gift card with the fields the payment reads passes through unchanged', () => {
  assert.equal(CtxResponse.giftCard(giftCard), giftCard);
});

test('a gift card with a missing, mistyped or unknown money field is refused', () => {
  const { paymentId: _, ...withoutPaymentId } = giftCard;
  assert.throws(() => CtxResponse.giftCard(withoutPaymentId), unexpected(/gift card .* paymentId/));
  assert.throws(() => CtxResponse.giftCard({ ...giftCard, paymentCryptoAmount: 24.5 }), unexpected(/paymentCryptoAmount/));
  assert.throws(() => CtxResponse.giftCard({ ...giftCard, status: 'settled' }), unexpected(/status/));
  assert.throws(() => CtxResponse.giftCard({ ...giftCard, paymentStatus: 'done' }), unexpected(/paymentStatus/));
  assert.throws(() => CtxResponse.giftCard(null), unexpected(/not an object/));
  assert.throws(() => CtxResponse.giftCard([giftCard]), unexpected(/not an object/));
});

test('a refusal shows the generic server message, not the shape detail', () => {
  assert.throws(
    () => CtxResponse.giftCard({}),
    (error) => error instanceof UnexpectedResponse && error.message === 'Something went wrong on our side. Try again in a moment.',
  );
});

test('a list of gift cards is checked item by item and a missing list is empty', () => {
  assert.deepEqual(CtxResponse.listOf('gift cards', null, CtxResponse.giftCard, unreported), []);
  assert.deepEqual(CtxResponse.listOf('gift cards', [giftCard], CtxResponse.giftCard, unreported), [giftCard]);
  assert.throws(() => CtxResponse.listOf('gift cards', {}, CtxResponse.giftCard, unreported), unexpected(/not a list/));
});

test('a built transaction needs its envelope, digest, whole rule ids and expiry ledger', () => {
  const built = { transaction: 'AAAA', digest: 'ab', contextRuleIds: [1], expiryLedger: 1_060 };
  assert.equal(CtxResponse.builtTransaction(built), built);
  assert.throws(() => CtxResponse.builtTransaction({ ...built, expiryLedger: '1060' }), unexpected(/expiryLedger/));
  assert.throws(() => CtxResponse.builtTransaction({ ...built, contextRuleIds: [1.5] }), unexpected(/contextRuleIds/));
  assert.throws(() => CtxResponse.builtTransaction({ ...built, contextRuleIds: null }), unexpected(/contextRuleIds/));
});

test('a sponsor answer needs a hash and status', () => {
  assert.deepEqual(CtxResponse.sponsored({ hash: 'H', status: 'PENDING' }), { hash: 'H', status: 'PENDING' });
  assert.throws(() => CtxResponse.sponsored({ status: 'PENDING' }), unexpected(/hash/));
  assert.throws(() => CtxResponse.sponsored({ hash: 'H', status: 'PENDING', error: {} }), unexpected(/error/));
});

test('a wallet link needs its id, address and sponsored flag', () => {
  const link = { id: 'w-1', chain: 'XLM', address: 'CWALLET', sponsored: true, status: 'active' };
  assert.equal(CtxResponse.walletLink(link), link);
  assert.throws(() => CtxResponse.walletLink({ ...link, sponsored: 'true' }), unexpected(/sponsored/));
  assert.throws(() => CtxResponse.walletLink({ ...link, address: undefined }), unexpected(/address/));
});

const payout = { id: 'po-1', status: 'pending', currency: 'USDC', amount: '1.00', kind: 'savings' };
const account = { wallet: [{ currency: 'USDC', amount: '1.00' }], payouts: [payout] };

test('an account checks each balance and payout and accepts empty lists', () => {
  assert.deepEqual(CtxResponse.account(account, unreported), account);
  assert.deepEqual(CtxResponse.account({ wallet: null, payouts: null }, unreported), { wallet: null, payouts: null });
  assert.throws(
    () => CtxResponse.account({ ...account, wallet: [{ currency: 'USDC', amount: 1 }] }, unreported),
    unexpected(/amount/),
  );
  assert.throws(
    () => CtxResponse.account({ ...account, payouts: [{ ...payout, amount: 1 }] }, unreported),
    unexpected(/amount/),
  );
  assert.throws(() => CtxResponse.account({ ...account, payouts: [{ ...payout, status: 7 }] }, unreported), unexpected(/status/));
  assert.throws(() => CtxResponse.account({ ...account, payouts: {} }, unreported), unexpected(/payouts/));
});

test('a payout with an unknown status or kind is skipped and reported, keeping the rest of the account', () => {
  const reported: string[] = [];
  const unknown = [
    { ...payout, id: 'po-2', status: 'lost' },
    { ...payout, id: 'po-3', kind: 'card' },
  ];
  const checked = CtxResponse.account({ ...account, payouts: [payout, ...unknown] }, (detail) => reported.push(detail));
  assert.deepEqual(checked, account);
  assert.deepEqual(reported, [
    'CTX payout has an unknown status "lost" or kind "savings"',
    'CTX payout has an unknown status "pending" or kind "card"',
  ]);
});

test('an unknown payout is reported once however many times the account loads', () => {
  const reported: string[] = [];
  const unknown = { ...payout, id: 'po-repeat', status: 'lost' };
  CtxResponse.account({ ...account, payouts: [unknown] }, (detail) => reported.push(detail));
  CtxResponse.account({ ...account, payouts: [unknown] }, (detail) => reported.push(detail));
  assert.equal(reported.length, 1);
});

test('a list skips and reports an item that fails its check, keeping the valid items', () => {
  const reported: string[] = [];
  const bad = { ...giftCard, id: 'gc-bad', status: 'settled' };
  const load = () =>
    CtxResponse.listOf('gift cards', [giftCard, bad], CtxResponse.giftCard, (detail) => reported.push(detail));
  assert.deepEqual(load(), [giftCard]);
  assert.deepEqual(load(), [giftCard]);
  assert.equal(reported.length, 1);
  assert.match(reported[0] ?? '', /status/);
});
