import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CtxError } from '../ctx/ctx-error.ts';
import { RequestTimeoutError } from '../ctx/deadline.ts';
import { UpdateInProgress } from '../updates/critical-update.ts';
import { IdentityNotConfirmed } from '../wallet/device-key.ts';
import { UserCancelled } from '../wallet/user-cancel.ts';
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

test('a refusal wrapped in another error is not reported', () => {
  const refusal = new Error('That code is wrong', { cause: new CtxError(400, '{"error":"ErrInvalidCode"}') });
  assert.equal(ReportableError.isAnomaly(refusal), false);
  assert.equal(ReportableError.isAnomaly(new Error('outer', { cause: new Error('inner') })), true);
});

test('a dismissed signing prompt and a reload in progress are not reported', () => {
  assert.equal(ReportableError.isAnomaly(new UserCancelled('The confirmation was cancelled')), false);
  assert.equal(ReportableError.isAnomaly(new UpdateInProgress()), false);
});

test('offline update failures from the native updater are not reported', () => {
  assert.equal(
    ReportableError.isAnomaly(new Error('Failed to download new update: The Internet connection appears to be offline.')),
    false,
  );
  assert.equal(ReportableError.isAnomaly(new Error('NetworkError when attempting to fetch resource.')), false);
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
