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
