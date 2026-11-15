import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SignInGate } from './sign-in-gate.ts';

test('an unsettled gate takes the first session answer', () => {
  assert.equal(SignInGate.next(null, true), true);
  assert.equal(SignInGate.next(null, false), false);
});

test('a refresh closes the gate when the session is gone', () => {
  assert.equal(SignInGate.next(true, false), false);
  assert.equal(SignInGate.next(true, true), true);
});

test('a refresh never opens the gate while sign-up is still running', () => {
  assert.equal(SignInGate.next(false, true), false);
});
