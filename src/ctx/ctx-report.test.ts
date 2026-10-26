import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ctxReportMessage } from './ctx-report.ts';

test('routine refusals and service switches are not reported', () => {
  assert.equal(ctxReportMessage(503, 'ErrMaintenanceMode'), null);
  assert.equal(ctxReportMessage(503, 'ErrKillSwitchActive'), null);
  assert.equal(ctxReportMessage(403, 'ErrClientDisabled'), null);
  assert.equal(ctxReportMessage(400, 'ErrAmountBelowMinimum'), null);
  assert.equal(ctxReportMessage(401, undefined), null);
  assert.equal(ctxReportMessage(429, 'ErrRateLimitReached'), null);
  assert.equal(ctxReportMessage(409, 'ErrPaymentAlreadySubmitted'), null);
});

test('server errors report only the status and error name', () => {
  assert.equal(ctxReportMessage(500, 'ErrInternal'), 'CTX 500 ErrInternal');
  assert.equal(ctxReportMessage(502, undefined), 'CTX 502');
});
