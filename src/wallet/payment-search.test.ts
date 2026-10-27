import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { LedgerRange } from '../stellar/transfer-events.ts';
import { PaymentSearch, type TransferSource } from './payment-search.ts';
import { SponsoredCall } from './sponsored-call.ts';

type Search = { contractId: string; from: string; to: string; ledgers: LedgerRange };

function source(transfers: unknown[]): TransferSource & { searches: Search[] } {
  const searches: Search[] = [];
  return {
    searches,
    async transfers(contractId, from, to, ledgers) {
      searches.push({ contractId, from, to, ledgers });
      return transfers;
    },
    async retention() {
      return retention;
    },
  };
}

test('the payment search covers every ledger the signed call could land in', async () => {
  const transfers = source([]);
  await new PaymentSearch(transfers, 'wallet', 'payee').landed('token', { amount: 25n }, 500);
  assert.deepEqual(transfers.searches, [
    {
      contractId: 'token',
      from: 'wallet',
      to: 'payee',
      ledgers: { startLedger: 500 - SponsoredCall.maxExpiryLedgers, endLedger: 501 },
    },
  ]);
});

test('a payment has landed when a transfer matches the signed amount and muxed id', async () => {
  const search = (transfers: unknown[]) => new PaymentSearch(source(transfers), 'wallet', 'payee');
  const signed = { amount: 25n, muxedId: 7n };
  assert.equal(await search([{ amount: 25n, to_muxed_id: 7n }]).landed('token', signed, 500), true);
  assert.equal(await search([{ amount: 25n, to_muxed_id: 8n }]).landed('token', signed, 500), false);
  assert.equal(await search([24n]).landed('token', { amount: 25n }, 500), false);
  assert.equal(await search([]).landed('token', null, 500), false);
});

const minute = 60_000;
const retention = { oldestLedger: 190_000, latestLedger: 200_000 };
const now = 10_000 * minute;

test('the order payment search spans the order lifetime at any ledger close time, plus the signing window', () => {
  const ledgers = PaymentSearch.ledgersDuring(retention, { from: now - 60 * minute, to: now - 30 * minute }, now);
  assert.deepEqual(ledgers, {
    startLedger: 200_000 - (60 * minute) / PaymentSearch.fastestLedgerMs - SponsoredCall.maxExpiryLedgers,
    endLedger: 200_000 - Math.floor((30 * minute) / PaymentSearch.slowestLedgerMs) + SponsoredCall.maxExpiryLedgers + 1,
  });
});

test('the order payment search stays inside the ledgers the server keeps', () => {
  assert.deepEqual(PaymentSearch.ledgersDuring(retention, { from: 0, to: now - minute }, now), {
    startLedger: 190_000,
    endLedger: 200_001,
  });
  assert.equal(PaymentSearch.ledgersDuring(retention, { from: 0, to: minute }, now), null);
});

test('an order payment from any device is found by its amount and muxed id within the order lifetime', async () => {
  const span = { from: now - 60 * minute, to: now - 30 * minute };
  const search = (transfers: unknown[]) => new PaymentSearch(source(transfers), 'wallet', 'payee');
  const order = { amount: 25n, muxedId: 7n };
  assert.equal(await search([{ amount: 25n, to_muxed_id: 7n }]).landedDuring('token', order, span, now), true);
  assert.equal(await search([{ amount: 25n, to_muxed_id: 8n }]).landedDuring('token', order, span, now), false);
  const searched = source([{ amount: 25n, to_muxed_id: 7n }]);
  await new PaymentSearch(searched, 'wallet', 'payee').landedDuring('token', order, { from: 0, to: minute }, now);
  assert.deepEqual(searched.searches, []);
});
