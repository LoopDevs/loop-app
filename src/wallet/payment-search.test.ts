import assert from 'node:assert/strict';
import { test } from 'node:test';

import { landingGraceLedgers } from '../ctx/payment-state.ts';
import type { LedgerRange } from '../stellar/transfer-events.ts';
import { PaymentSearch, type TransferSource } from './payment-search.ts';
import { SponsoredCall } from './sponsored-call.ts';

type Search = { contractId: string; from: string; to: string; ledgers: LedgerRange };

const expiryLedger = 500;
const closedLedger = expiryLedger + landingGraceLedgers + 1;

function source(transfers: unknown[], latestLedger = closedLedger): TransferSource & { searches: Search[] } {
  const searches: Search[] = [];
  return {
    searches,
    async transfers(contractId, from, to, ledgers) {
      searches.push({ contractId, from, to, ledgers });
      return { transfers, latestLedger };
    },
  };
}

test('the payment search covers every ledger the signed call could land in', async () => {
  const transfers = source([]);
  await new PaymentSearch(transfers, 'wallet', 'payee').missing('token', { amount: 25n }, expiryLedger);
  assert.deepEqual(transfers.searches, [
    {
      contractId: 'token',
      from: 'wallet',
      to: 'payee',
      ledgers: { startLedger: expiryLedger - SponsoredCall.maxExpiryLedgers, endLedger: expiryLedger + 1 },
    },
  ]);
});

test('a payment is missing when no transfer matches the signed amount and muxed id', async () => {
  const search = (transfers: unknown[]) => new PaymentSearch(source(transfers), 'wallet', 'payee');
  const signed = { amount: 25n, muxedId: 7n };
  assert.equal(await search([{ amount: 25n, to_muxed_id: 7n }]).missing('token', signed, expiryLedger), false);
  assert.equal(await search([{ amount: 25n, to_muxed_id: 8n }]).missing('token', signed, expiryLedger), true);
  assert.equal(await search([24n]).missing('token', { amount: 25n }, expiryLedger), true);
  assert.equal(await search([]).missing('token', null, expiryLedger), true);
});

test('a payment is not missing while the events view has not passed the landing window', async () => {
  const lagging = source([], expiryLedger + landingGraceLedgers);
  const search = new PaymentSearch(lagging, 'wallet', 'payee');
  assert.equal(await search.missing('token', { amount: 25n }, expiryLedger), false);
});
