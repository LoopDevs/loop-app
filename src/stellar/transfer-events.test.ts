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

test('the topics keep the transfer symbol first, then the sender, then the recipient', () => {
  const [exact, open] = TransferEvents.request(token, wallet, payee, { startLedger: 1, endLedger: 2 }).filters?.[0]
    .topics ?? [[], []];
  assert.deepEqual(exact.map((topic) => xdr.ScVal.fromXDR(topic, 'base64').type), [
    'scvSymbol',
    'scvAddress',
    'scvAddress',
  ]);
  assert.equal(exact[1], Address.fromString(wallet).toScVal().toXDR('base64'));
  assert.equal(exact[2], Address.fromString(payee).toScVal().toXDR('base64'));
  assert.deepEqual(open, [...exact, '*']);
});

test('swapping the sender and recipient swaps their topics', () => {
  const forward = TransferEvents.request(token, wallet, payee, { startLedger: 1, endLedger: 2 });
  const reverse = TransferEvents.request(token, payee, wallet, { startLedger: 1, endLedger: 2 });
  const [forwardTopics] = forward.filters?.[0].topics ?? [[]];
  const [reverseTopics] = reverse.filters?.[0].topics ?? [[]];
  assert.equal(forwardTopics[1], reverseTopics[2]);
  assert.equal(forwardTopics[2], reverseTopics[1]);
});

test('the ledger range is passed through unchanged, including a single-ledger range', () => {
  const request = TransferEvents.request(token, wallet, payee, { startLedger: 7, endLedger: 7 });
  assert.equal(request.startLedger, 7);
  assert.equal(request.endLedger, 7);
});

test('an address that is not a Stellar address is refused before a search is built', () => {
  assert.throws(() => TransferEvents.request(token, 'not-an-address', payee, { startLedger: 1, endLedger: 2 }));
  assert.throws(() => TransferEvents.request(token, wallet, '', { startLedger: 1, endLedger: 2 }));
});
