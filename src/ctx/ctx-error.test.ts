import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CtxError } from './ctx-error.ts';

test('savings switched off at CTX reads as savings unavailable', () => {
  const error = new CtxError(400, JSON.stringify({ error: 'ErrSavingsUnavailable', message: 'savings are not available' }));
  assert.equal(error.message, "Savings isn't available right now.");
});

test('a sponsor rate limit reads as too many requests', () => {
  const error = new CtxError(429, JSON.stringify({ error: 'ErrTooManyRequests' }));
  assert.equal(error.message, 'Too many requests. Wait a few minutes and try again.');
});

test('an unmapped CTX error shows its status and body', () => {
  const body = JSON.stringify({ error: 'ErrValidation' });
  assert.equal(new CtxError(400, body).message, `CTX 400: ${body}`);
});
