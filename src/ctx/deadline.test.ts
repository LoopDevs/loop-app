import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Deadline, RequestTimeoutError } from './deadline.ts';

test('a request that never answers fails with a timeout and is aborted', async () => {
  let aborted = false;
  const stalled = (signal: AbortSignal) =>
    new Promise<string>(() => {
      signal.addEventListener('abort', () => {
        aborted = true;
      });
    });
  await assert.rejects(Deadline.run(10, stalled), RequestTimeoutError);
  assert.equal(aborted, true);
});

test('a request that answers in time returns its result and is not aborted', async () => {
  let seen: AbortSignal | undefined;
  const result = await Deadline.run(1_000, async (signal) => {
    seen = signal;
    return 'ok';
  });
  assert.equal(result, 'ok');
  assert.equal(seen?.aborted, false);
});

test('a request that fails in time keeps its own error', async () => {
  await assert.rejects(
    Deadline.run(1_000, async () => {
      throw new Error('refused');
    }),
    /refused/,
  );
});

test('the refresh deadline leaves a retry inside the 30 s rotation grace', () => {
  assert.ok(Deadline.refreshMs * 2 < 30_000);
});
