import assert from 'node:assert/strict';
import { test } from 'node:test';

import { StoredSessionText } from './stored-session.ts';

test('a stored session reads back as the refresh token and its owner', () => {
  const text = StoredSessionText.write({ refreshToken: 'r1', owner: 'user-1' });
  assert.deepEqual(StoredSessionText.read(text), { refreshToken: 'r1', owner: 'user-1' });
});

test('a bare refresh token or a session without an owner reads as no session', () => {
  assert.equal(StoredSessionText.read(null), null);
  assert.equal(StoredSessionText.read('r1'), null);
  assert.equal(StoredSessionText.read('"r1"'), null);
  assert.equal(StoredSessionText.read('null'), null);
  assert.equal(StoredSessionText.read('{"refreshToken":"r1"}'), null);
  assert.equal(StoredSessionText.read('{"refreshToken":"r1","owner":""}'), null);
  assert.equal(StoredSessionText.read('{"refreshToken":7,"owner":"user-1"}'), null);
});
