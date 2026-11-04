import assert from 'node:assert/strict';
import test from 'node:test';

import { CtxError } from './ctx-error.ts';

test('a wrong sign-in code shows plain copy, not the response body', () => {
  const error = new CtxError(400, '{"error":"ErrInvalidCode","message":"invalid verification code"}');
  assert.equal(error.message, CtxError.knownMessages.ErrInvalidCode);
  assert.equal(error.errorName(), 'ErrInvalidCode');
});

test('savings switched off at CTX reads as savings unavailable', () => {
  const error = new CtxError(400, '{"error":"ErrSavingsUnavailable","message":"savings are not available"}');
  assert.equal(error.message, "Savings isn't available right now.");
});

test('an unknown client error shows generic copy and keeps the body for callers', () => {
  const body = '{"error":"ErrSomethingNew","email":"a@b.c"}';
  const error = new CtxError(422, body);
  assert.equal(error.message, CtxError.requestFailedMessage);
  assert.equal(error.body, body);
});

test('a server error or a non-JSON body shows the server copy', () => {
  assert.equal(new CtxError(502, '<html>Bad gateway</html>').message, CtxError.serverFailedMessage);
});
