import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CtxError } from '../ctx/ctx-error.ts';
import { RequestTimeoutError } from '../ctx/deadline.ts';
import { IdentityNotConfirmed } from '../wallet/device-key.ts';
import { ReportableError } from './reportable-error.ts';

test('CTX refusals and server errors are not reported a second time', () => {
  assert.equal(ReportableError.isAnomaly(new CtxError(400, '{"error":"ErrInvalidCode"}')), false);
  assert.equal(ReportableError.isAnomaly(new CtxError(422, '')), false);
  assert.equal(ReportableError.isAnomaly(new CtxError(500, '')), false);
});

test('a declined biometric or passkey prompt is not reported', () => {
  assert.equal(ReportableError.isAnomaly(new IdentityNotConfirmed()), false);
  assert.equal(ReportableError.isAnomaly(Object.assign(new Error('cancelled'), { code: 'ERR_USER_CANCELLED' })), false);
  assert.equal(ReportableError.isAnomaly(new Error('UserCancelled')), false);
});

test('offline and timeout failures are not reported', () => {
  assert.equal(ReportableError.isAnomaly(new RequestTimeoutError()), false);
  assert.equal(ReportableError.isAnomaly(new TypeError('Network request failed')), false);
  assert.equal(ReportableError.isAnomaly(new TypeError('Failed to fetch')), false);
});

test('signing, wallet and unexpected failures are reported', () => {
  assert.equal(ReportableError.isAnomaly(new Error('Simulation failed')), true);
  assert.equal(ReportableError.isAnomaly(new TypeError("Cannot read properties of undefined (reading 'id')")), true);
  assert.equal(ReportableError.isAnomaly('boom'), true);
});

test('the summary carries the error name and stack but not its message', () => {
  const failure = new RangeError('insufficient balance for 12.50 USDC at Aerie');
  const summary = ReportableError.summary(failure, 'action');
  assert.equal(summary.message, 'action failed: RangeError');
  assert.equal(summary.name, 'RangeError');
  assert.equal(summary.stack, failure.stack);
  assert.equal(ReportableError.summary('boom', 'load').message, 'load failed: NonError');
});
