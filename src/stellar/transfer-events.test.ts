import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Address, xdr } from '@stellar/stellar-sdk';

import { TransferEvents } from './transfer-events.ts';

const token = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const wallet = 'CCNMXHVK6ODB6GY3Z3ZU5K3RFN5NJ6AQLTVGXUNWTCFVHLACIR2BLLHZ';
const payee = 'GAYHOZUORLQYLH6N5BX56TXEOIGJCITMZPLFUS7GUEZEIITDQP224LNG';

test('the transfer search filters on the token and the transfer topics from wallet to payee', () => {
  const topics = [
    xdr.ScVal.scvSymbol('transfer').toXDR('base64'),
    Address.fromString(wallet).toScVal().toXDR('base64'),
    Address.fromString(payee).toScVal().toXDR('base64'),
  ];
  assert.deepEqual(TransferEvents.request(token, wallet, payee, { startLedger: 380, endLedger: 501 }), {
    startLedger: 380,
    endLedger: 501,
    filters: [
      {
        type: 'contract',
        contractIds: [token],
        topics: [topics, [...topics, '*']],
      },
    ],
  });
});
