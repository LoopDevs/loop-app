import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SessionOwner } from './session-owner.ts';

test('the first read is not a change', () => {
  assert.equal(new SessionOwner().changed('a'), false);
});

test('the same user is not a change', () => {
  const owner = new SessionOwner();
  owner.changed('a');
  assert.equal(owner.changed('a'), false);
});

test('signing out and switching user are changes', () => {
  const owner = new SessionOwner();
  owner.changed('a');
  assert.equal(owner.changed(null), true);
  assert.equal(owner.changed('b'), true);
  assert.equal(owner.changed('b'), false);
});
