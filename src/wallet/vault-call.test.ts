import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CtxError } from '../ctx/ctx-error.ts';
import { VaultCall, type ChainTransaction } from './vault-call.ts';

const expiryLedger = 1_060;

function chainAnswering(answers: (ChainTransaction | Error)[], latestLedger = 1_000) {
  let clock = 0;
  let polls = 0;
  const vaultCall = new VaultCall({
    transaction: async () => {
      const answer = answers[Math.min(polls, answers.length - 1)];
      polls += 1;
      if (answer instanceof Error) {
        throw answer;
      }
      return answer;
    },
    latestLedger: async () => latestLedger,
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
  });
  return { vaultCall, elapsed: () => clock, polls: () => polls };
}

test('a vault call not found counts as failed once its signature has expired', () => {
  const pending = { hash: 'HASH', expiryLedger };
  assert.equal(VaultCall.outcomeOf({ status: 'NOT_FOUND', latestLedger: expiryLedger }, pending), 'pending');
  assert.equal(VaultCall.outcomeOf({ status: 'NOT_FOUND', latestLedger: expiryLedger + 1 }, pending), 'failed');
  assert.equal(VaultCall.outcomeOf({ status: 'SUCCESS', latestLedger: expiryLedger + 1 }, pending), 'success');
  assert.equal(VaultCall.outcomeOf({ status: 'FAILED', latestLedger: 1_000 }, pending), 'failed');
});

test('a vault call still not found stops polling at the confirm cap', async () => {
  const chain = chainAnswering([{ status: 'NOT_FOUND', latestLedger: 1_000 }]);
  assert.equal(await chain.vaultCall.confirm({ hash: 'HASH', expiryLedger }), 'pending');
  assert.equal(chain.elapsed(), VaultCall.confirmTimeoutMs);
  assert.equal(chain.polls(), VaultCall.confirmTimeoutMs / VaultCall.confirmPollMs + 1);
});

test('a read error while confirming counts as pending and polling continues', async () => {
  const chain = chainAnswering([new Error('rpc down'), { status: 'SUCCESS', latestLedger: 1_000 }]);
  assert.equal(await chain.vaultCall.confirm({ hash: 'HASH', expiryLedger }), 'success');
  assert.equal(chain.polls(), 2);
});

test('a vault call with no hash is judged by the ledger against its expiry', async () => {
  const before = chainAnswering([], expiryLedger);
  assert.equal(await before.vaultCall.status({ hash: '', expiryLedger }), 'pending');
  const after = chainAnswering([], expiryLedger + 1);
  assert.equal(await after.vaultCall.status({ hash: '', expiryLedger }), 'failed');
  assert.equal(after.polls(), 0);
});

test('a vault call refused at the sponsor settles as failed without a confirmation poll', async () => {
  const refusals = [
    { hash: '', status: 'failed', error: 'tx_failed' },
    { hash: 'HASH', status: 'failed' },
    { hash: 'HASH', status: 'pending', error: 'tx_bad_seq' },
    { hash: '', status: 'pending' },
  ];
  for (const refusal of refusals) {
    const chain = chainAnswering([{ status: 'SUCCESS', latestLedger: 1_000 }]);
    assert.equal(await chain.vaultCall.settle({ ...refusal, expiryLedger }), 'failed');
    assert.equal(chain.polls(), 0);
  }
});

test('a vault call accepted at the sponsor settles to its confirmed outcome', async () => {
  const chain = chainAnswering([
    { status: 'NOT_FOUND', latestLedger: 1_000 },
    { status: 'SUCCESS', latestLedger: 1_001 },
  ]);
  assert.equal(await chain.vaultCall.settle({ hash: 'HASH', status: 'pending', expiryLedger }), 'success');
  assert.equal(chain.polls(), 2);
});

test('only a client error from CTX counts as refused by the sponsor', () => {
  assert.equal(VaultCall.refusedBySponsor(new CtxError(400, '{"error":"ErrSavingsUnavailable"}')), true);
  assert.equal(VaultCall.refusedBySponsor(new CtxError(503, 'down')), false);
  assert.equal(VaultCall.refusedBySponsor(new TypeError('Network request failed')), false);
});
