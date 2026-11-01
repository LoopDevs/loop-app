import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Account, MuxedAccount } from '@stellar/stellar-sdk';

import type { GiftCard } from '../ctx/client.ts';
import { landingGraceLedgers } from '../ctx/payment-state.ts';
import { network } from '../stellar/network.ts';
import type { LedgerRange, TransferEvent } from '../stellar/transfer-events.ts';
import {
  PaymentCheck,
  PaymentSearch,
  type LedgerRetention,
  type OrderPayer,
  type OrderPayment,
  type TransferSource,
} from './payment-search.ts';
import { SponsoredCall } from './sponsored-call.ts';

type Search = {
  contractId: string;
  from: string;
  to: string;
  ledgers: LedgerRange;
};

const expiryLedger = 500;
const closedLedger = expiryLedger + landingGraceLedgers + 1;
const retention = { oldestLedger: 190_000, latestLedger: 200_000 };

function source(
  transfers: TransferEvent[],
  held: LedgerRetention = retention,
  latestLedger = closedLedger,
): TransferSource & { searches: Search[] } {
  const searches: Search[] = [];
  return {
    searches,
    async transfers(contractId, from, to, ledgers) {
      searches.push({ contractId, from, to, ledgers });
      return { transfers, latestLedger };
    },
    async retention() {
      return held;
    },
  };
}

function event(value: unknown, closedAt = 0, txHash = 'tx'): TransferEvent {
  return { value, txHash, closedAt };
}

test('the payment search covers every ledger the signed call could land in', async () => {
  const transfers = source([]);
  await new PaymentSearch(transfers, 'wallet', 'payee').missing('token', { amount: 25n }, expiryLedger);
  assert.deepEqual(transfers.searches, [
    {
      contractId: 'token',
      from: 'wallet',
      to: 'payee',
      ledgers: {
        startLedger: expiryLedger - SponsoredCall.maxExpiryLedgers,
        endLedger: expiryLedger + 1,
      },
    },
  ]);
});

test('a payment is missing when no transfer matches the signed amount and muxed id', async () => {
  const search = (values: unknown[]) =>
    new PaymentSearch(source(values.map((value) => event(value))), 'wallet', 'payee');
  const signed = { amount: 25n, muxedId: 7n };
  assert.equal(await search([{ amount: 25n, to_muxed_id: 7n }]).missing('token', signed, expiryLedger), false);
  assert.equal(await search([{ amount: 25n, to_muxed_id: 8n }]).missing('token', signed, expiryLedger), true);
  assert.equal(await search([24n]).missing('token', { amount: 25n }, expiryLedger), true);
  assert.equal(await search([]).missing('token', null, expiryLedger), true);
});

test('a payment is not missing while the events view has not passed the landing window', async () => {
  const lagging = source([], retention, expiryLedger + landingGraceLedgers);
  const search = new PaymentSearch(lagging, 'wallet', 'payee');
  assert.equal(await search.missing('token', { amount: 25n }, expiryLedger), false);
});

const minute = 60_000;
const now = 10_000 * minute;

test('the order payment search spans the order lifetime at any ledger close time, plus the signing window', () => {
  assert.deepEqual(PaymentSearch.ledgersDuring(retention, { from: now - 60 * minute, to: now - 30 * minute }, now), {
    ledgers: { startLedger: 198_980, endLedger: 199_864 },
    complete: true,
  });
});

test('the order payment search starts clear of the oldest ledger the server keeps and says when it is cut short', () => {
  assert.deepEqual(PaymentSearch.ledgersDuring(retention, { from: 0, to: now - minute }, now), {
    ledgers: { startLedger: 190_060, endLedger: 200_001 },
    complete: false,
  });
  assert.equal(PaymentSearch.ledgersDuring(retention, { from: 0, to: minute }, now), null);
  assert.equal(PaymentSearch.ledgersDuring(retention, { from: Number.NaN, to: now - minute }, now), null);
});

const created = Date.parse('2026-01-01T00:00:00Z');
const expires = Date.parse('2026-01-01T00:30:00Z');
const checkedAt = Date.parse('2026-01-01T01:00:00Z');
const usdc = network.tokens.find((token) => token.currency === 'XLM.USDC')!;
const orderAddress = new MuxedAccount(new Account(network.payee, '0'), '7').accountId();

const expiredOrder = (fields: Partial<GiftCard> = {}): GiftCard => ({
  id: 'g1',
  status: 'expired',
  merchantId: 'm1',
  merchantName: 'Merchant',
  created: '2026-01-01T00:00:00Z',
  cardFiatAmount: '25.00',
  cardFiatCurrency: 'USD',
  paymentId: 'p1',
  paymentStatus: 'expired',
  paymentMethod: 'crypto',
  paymentCryptoAmount: '2.5',
  paymentCryptoCurrency: 'XLM.USDC',
  paymentCryptoAddress: orderAddress,
  paymentUrlExpiration: '2026-01-01T00:30:00Z',
  ...fields,
});

const orderPayment = { amount: 25_000_000n, to_muxed_id: 7n };

test('the transfer an order expects carries the order amount and the muxed id of the order address', () => {
  assert.deepEqual(PaymentSearch.orderTransfer(expiredOrder())?.expected, { amount: 25_000_000n, muxedId: 7n });
  assert.deepEqual(PaymentSearch.orderTransfer(expiredOrder({ paymentCryptoAddress: network.payee }))?.expected, {
    amount: 25_000_000n,
  });
  assert.equal(PaymentSearch.orderTransfer(expiredOrder({ paymentCryptoAmount: '' })), null);
});

test('an order payment search looks for the order token, amount and muxed id across the order lifetime', async () => {
  const transfers = source(
    [event(orderPayment, created + 5_000, 'paid-tx')],
    { oldestLedger: 100_000, latestLedger: 200_000 },
    200_000,
  );
  const payment = await new PaymentSearch(transfers, 'wallet', 'payee').orderPaid(expiredOrder(), checkedAt);
  assert.deepEqual(payment, { kind: 'sent', txId: 'paid-tx' });
  assert.deepEqual(transfers.searches, [
    {
      contractId: usdc.contract,
      from: 'wallet',
      to: 'payee',
      ledgers: { startLedger: 198_980, endLedger: 199_864 },
    },
  ]);
});

test('an order payment search only counts a transfer of the order amount to the order muxed id while the order was open', async () => {
  const held = { oldestLedger: 100_000, latestLedger: 200_000 };
  const search = (transfers: TransferEvent[]) =>
    new PaymentSearch(source(transfers, held, held.latestLedger), 'wallet', 'payee').orderPaid(expiredOrder(), checkedAt);
  const notSent: OrderPayment = { kind: 'notSent' };
  assert.deepEqual(await search([]), notSent);
  assert.deepEqual(await search([event({ amount: 25_000_000n, to_muxed_id: 8n }, created + 5_000)]), notSent);
  assert.deepEqual(await search([event({ amount: 24_000_000n, to_muxed_id: 7n }, created + 5_000)]), notSent);
  assert.deepEqual(await search([event(orderPayment, created - 2 * minute)]), notSent);
  assert.deepEqual(await search([event(orderPayment, expires + 20 * minute)]), notSent);
  assert.deepEqual(await search([event(orderPayment, expires + 5 * minute, 'late')]), { kind: 'sent', txId: 'late' });
});

test('an order payment search that cannot cover the order lifetime never says the payment was not sent', async () => {
  const cutShort = { oldestLedger: 199_000, latestLedger: 200_000 };
  assert.deepEqual(
    await new PaymentSearch(source([], cutShort, cutShort.latestLedger), 'wallet', 'payee').orderPaid(expiredOrder(), checkedAt),
    { kind: 'unknown' },
  );
  const gone = { oldestLedger: 199_900, latestLedger: 200_000 };
  const transfers = source([], gone);
  assert.deepEqual(await new PaymentSearch(transfers, 'wallet', 'payee').orderPaid(expiredOrder(), checkedAt), {
    kind: 'unknown',
  });
  assert.deepEqual(transfers.searches, []);
});

test('an order payment search never says the payment was not sent from an events view behind the searched ledgers', async () => {
  const held = { oldestLedger: 100_000, latestLedger: 200_000 };
  const behind = (latestLedger: number) =>
    new PaymentSearch(source([], held, latestLedger), 'wallet', 'payee').orderPaid(expiredOrder(), checkedAt);
  assert.deepEqual(await behind(199_862), { kind: 'unknown' });
  assert.deepEqual(await behind(199_863), { kind: 'notSent' });
});

test('an order in a token the wallet does not hold has no payment to search for', async () => {
  const transfers = source([event(orderPayment, created + 5_000)]);
  const order = expiredOrder({ paymentCryptoCurrency: 'BTC' });
  assert.deepEqual(await new PaymentSearch(transfers, 'wallet', 'payee').orderPaid(order, checkedAt), {
    kind: 'notSent',
  });
  assert.deepEqual(transfers.searches, []);
});

function payer(orderPaid: (giftCard: GiftCard) => Promise<OrderPayment>): OrderPayer & { searched: number } {
  const wallet = {
    searched: 0,
    async orderPaid(giftCard: GiftCard) {
      wallet.searched += 1;
      return orderPaid(giftCard);
    },
  };
  return wallet;
}

const noRecords = { get: async () => null };

test('a payment this device recorded is sent without searching the wallet', async () => {
  const wallet = payer(async () => ({ kind: 'notSent' }));
  const check = new PaymentCheck({ get: async () => ({ txId: 'local-tx' }) }, async () => wallet);
  assert.deepEqual(await check.sent(expiredOrder()), {
    kind: 'sent',
    txId: 'local-tx',
  });
  assert.equal(wallet.searched, 0);
});

test('an order CTX recorded as charged is not searched for and never reported as not sent', async () => {
  const wallet = payer(async () => ({ kind: 'notSent' }));
  const check = new PaymentCheck(noRecords, async () => wallet);
  const payment = await check.sent(expiredOrder({ paymentStatus: 'paid' }));
  assert.notEqual(payment.kind, 'notSent');
  assert.equal(wallet.searched, 0);
});

test('an expired order is sent when the wallet search finds its payment', async () => {
  const check = new PaymentCheck(noRecords, async () => payer(async () => ({ kind: 'sent', txId: 'found' })));
  assert.deepEqual(await check.sent(expiredOrder()), {
    kind: 'sent',
    txId: 'found',
  });
});

test('a failed wallet search leaves the payment unknown, never not sent', async () => {
  const failingSearch = new PaymentCheck(noRecords, async () =>
    payer(async () => {
      throw new Error('startLedger must be within the ledger range');
    }),
  );
  assert.deepEqual(await failingSearch.sent(expiredOrder()), {
    kind: 'unknown',
  });
  const failingLoad = new PaymentCheck(noRecords, async () => {
    throw new Error('offline');
  });
  assert.deepEqual(await failingLoad.sent(expiredOrder()), { kind: 'unknown' });
});

test('an unreadable payment record falls back to the wallet search', async () => {
  const check = new PaymentCheck({ get: async () => Promise.reject(new Error('storage')) }, async () =>
    payer(async () => ({ kind: 'sent', txId: 'found' })),
  );
  assert.deepEqual(await check.sent(expiredOrder()), {
    kind: 'sent',
    txId: 'found',
  });
});

test('an account without a wallet has not sent the payment', async () => {
  assert.deepEqual(await new PaymentCheck(noRecords, async () => null).sent(expiredOrder()), { kind: 'notSent' });
});
