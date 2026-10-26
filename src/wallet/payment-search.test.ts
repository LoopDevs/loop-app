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
