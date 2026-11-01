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

test('a status below 500 is never reported, whatever the error name', () => {
  assert.equal(ctxReportMessage(499, 'ErrInternal'), null);
  assert.equal(ctxReportMessage(400, 'ErrInternal'), null);
  assert.equal(ctxReportMessage(404, undefined), null);
});

test('every 5xx is reported from 500 up', () => {
  assert.equal(ctxReportMessage(500, undefined), 'CTX 500');
  assert.equal(ctxReportMessage(599, 'ErrUpstream'), 'CTX 599 ErrUpstream');
});

test('a service switch on a 5xx is not reported but a similar unknown name is', () => {
  assert.equal(ctxReportMessage(500, 'ErrMaintenanceMode'), null);
  assert.equal(ctxReportMessage(500, 'ErrKillSwitchActive'), null);
  assert.equal(ctxReportMessage(500, 'ErrClientDisabled'), null);
  assert.equal(ctxReportMessage(500, 'ErrMaintenance'), 'CTX 500 ErrMaintenance');
  assert.equal(ctxReportMessage(502, ''), 'CTX 502');
});
