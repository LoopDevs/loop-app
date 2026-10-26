import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SessionTokens } from './session-tokens.ts';

test('a started session adopts its access token', () => {
  const session = new SessionTokens();
  const generation = session.begin();
  assert.equal(session.adopt(generation, 'a1'), true);
  assert.equal(session.token(), 'a1');
});

test('a 401 in the current session drops the rejected token', () => {
  const session = new SessionTokens();
  const generation = session.begin();
  session.adopt(generation, 'a1');
  assert.equal(session.reject(generation, 'a1'), true);
  assert.equal(session.token(), null);
});

test('a 401 for a token already replaced keeps the replacement', () => {
  const session = new SessionTokens();
  const generation = session.begin();
  session.adopt(generation, 'a2');
  assert.equal(session.reject(generation, 'a1'), true);
  assert.equal(session.token(), 'a2');
});

test('a late 401 from a signed-out session leaves the next session alone', () => {
  const session = new SessionTokens();
  const signedOut = session.begin();
  session.adopt(signedOut, 'old');
  session.begin();
  const signedIn = session.begin();
  session.adopt(signedIn, 'new');
  assert.equal(session.reject(signedOut, 'old'), false);
  assert.equal(session.reject(signedOut, 'new'), false);
  assert.equal(session.token(), 'new');
});

test('a late refresh from a signed-out session cannot install its token', () => {
  const session = new SessionTokens();
  const signedOut = session.begin();
  const signedIn = session.begin();
  session.adopt(signedIn, 'new');
  assert.equal(session.adopt(signedOut, 'stale'), false);
  assert.equal(session.token(), 'new');
  assert.equal(session.isCurrent(signedOut), false);
  assert.equal(session.isCurrent(signedIn), true);
});

test('ending a session clears its token', () => {
  const session = new SessionTokens();
  session.adopt(session.begin(), 'a1');
  session.begin();
  assert.equal(session.token(), null);
});

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('concurrent refreshes in one session share a single rotation', async () => {
  const session = new SessionTokens();
  const generation = session.begin();
  const rotated = deferred<string | null>();
  let rotations = 0;
  const rotate = () => {
    rotations += 1;
    return rotated.promise;
  };
  const first = session.refreshOnce(generation, rotate);
  const second = session.refreshOnce(generation, rotate);
  rotated.resolve('a2');
  assert.equal(await first, 'a2');
  assert.equal(await second, 'a2');
  assert.equal(rotations, 1);
});

test('a refresh during sign-in waits for the sign-in tokens and rotates nothing', async () => {
  const session = new SessionTokens();
  const generation = session.begin();
  const stored = deferred<string | null>();
  const signingIn = session.refreshOnce(generation, () => stored.promise);
  let rotations = 0;
  const duringSignIn = session.refreshOnce(session.current(), async () => {
    rotations += 1;
    return 'rotated';
  });
  stored.resolve('signed-in');
  assert.equal(await signingIn, 'signed-in');
  assert.equal(await duringSignIn, 'signed-in');
  assert.equal(rotations, 0);
});

test('a late 401 after a finished refresh keeps the refreshed token', async () => {
  const session = new SessionTokens();
  const generation = session.begin();
  session.adopt(generation, 'a1');
  session.reject(generation, 'a1');
  await session.refreshOnce(generation, async () => {
    session.adopt(generation, 'a2');
    return 'a2';
  });
  assert.equal(session.reject(generation, 'a1'), true);
  assert.equal(session.token(), 'a2');
});

test('a failed refresh lets the next one rotate again', async () => {
  const session = new SessionTokens();
  const generation = session.begin();
  await assert.rejects(
    session.refreshOnce(generation, async () => {
      throw new Error('timed out');
    }),
  );
  assert.equal(await session.refreshOnce(generation, async () => 'a2'), 'a2');
});

test('a refresh from a signed-out session is not shared with the next session', async () => {
  const session = new SessionTokens();
  const signedOut = session.begin();
  const stale = deferred<string | null>();
  const signedOutRefresh = session.refreshOnce(signedOut, () => stale.promise);
  const signedIn = session.begin();
  assert.equal(await session.refreshOnce(signedIn, async () => 'new'), 'new');
  stale.resolve(null);
  await signedOutRefresh;
});
