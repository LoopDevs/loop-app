import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CtxError } from './ctx-error.ts';
import { signInReportMessage } from './sign-in-report.ts';

test('known refusals, wrong credentials and service switches are not reported', () => {
  assert.equal(signInReportMessage('email', new CtxError(403, '{"error":"ErrAuthMethodNotAllowedForUser"}')), null);
  assert.equal(signInReportMessage('google', new CtxError(400, '{"error":"ErrOAuthEmailUnverified"}')), null);
  assert.equal(signInReportMessage('apple', new CtxError(403, '{"error":"ErrUserSignupNotAllowed"}')), null);
  assert.equal(signInReportMessage('email', new CtxError(401, '')), null);
  assert.equal(signInReportMessage('email', new CtxError(400, '{"error":"ErrInvalidCode"}')), null);
  assert.equal(signInReportMessage('email', new CtxError(429, '{"error":"ErrRateLimitReached"}')), null);
  assert.equal(signInReportMessage('email', new CtxError(503, '{"error":"ErrMaintenanceMode"}')), null);
});

test('a sign-in refusal the client does not know is reported with its status and name', () => {
  assert.equal(
    signInReportMessage('google', new CtxError(400, '{"error":"ErrSomethingNew"}')),
    'CTX sign-in with google 400 ErrSomethingNew',
  );
  assert.equal(signInReportMessage('email', new CtxError(418, '<html>')), 'CTX sign-in with email 418');
});

test('a refusal for another sign-in method is reported', () => {
  assert.equal(
    signInReportMessage('email', new CtxError(400, '{"error":"ErrOAuthEmailUnverified"}')),
    'CTX sign-in with email 400 ErrOAuthEmailUnverified',
  );
});
