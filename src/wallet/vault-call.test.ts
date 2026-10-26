import assert from 'node:assert/strict';
import { test } from 'node:test';

import { landingGraceLedgers, type ChainTransaction } from '../ctx/payment-state.ts';
import { VaultCall } from './vault-call.ts';

const expiryLedger = 1_060;

function chainAnswering(answers: (ChainTransaction | Error)[]) {
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
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
  });
  return { vaultCall, elapsed: () => clock, polls: () => polls };
}

async function outcomeOf(transaction: ChainTransaction): Promise<string> {
  return chainAnswering([transaction]).vaultCall.confirm({ hash: 'HASH', expiryLedger });
}

test('a vault call not found counts as failed only after the landing grace past its expiry', async () => {
  const lastLandable = expiryLedger + landingGraceLedgers;
  assert.equal(await outcomeOf({ status: 'NOT_FOUND', latestLedger: expiryLedger + 1 }), 'pending');
  assert.equal(await outcomeOf({ status: 'NOT_FOUND', latestLedger: lastLandable }), 'pending');
  assert.equal(await outcomeOf({ status: 'NOT_FOUND', latestLedger: lastLandable + 1 }), 'failed');
});

test('a vault call the chain reports settles to its chain outcome', async () => {
  assert.equal(await outcomeOf({ status: 'SUCCESS', latestLedger: 1_000 }), 'success');
  assert.equal(await outcomeOf({ status: 'FAILED', latestLedger: 1_000 }), 'failed');
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
