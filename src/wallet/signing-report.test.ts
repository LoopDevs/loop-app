import assert from 'node:assert/strict';
import { test } from 'node:test';

import { IdentityNotConfirmed } from './device-key.ts';
import { reportingSigningFailure } from './signing-report.ts';
import { UserCancelled } from './user-cancel.ts';

function recorder() {
  const reports: { error: unknown; context: string }[] = [];
  return {
    reports,
    report: (error: unknown, context: string) => reports.push({ error, context }),
  };
}

test('a signing error is reported once with the signer named, then rethrown', async () => {
  const { reports, report } = recorder();
  const failure = new Error('key store unreadable');
  await assert.rejects(
    reportingSigningFailure('device key', report, () => Promise.reject(failure)),
    failure,
  );
  assert.deepEqual(reports, [{ error: failure, context: 'Signing with device key' }]);
});

test('a cancelled or declined prompt is rethrown without a report', async () => {
  for (const failure of [new UserCancelled('The confirmation was cancelled'), new IdentityNotConfirmed()]) {
    const { reports, report } = recorder();
    await assert.rejects(
      reportingSigningFailure('passkey', report, () => Promise.reject(failure)),
      failure,
    );
    assert.deepEqual(reports, []);
  }
});

test('a successful signature is returned without a report', async () => {
  const { reports, report } = recorder();
  assert.equal(await reportingSigningFailure('passkey', report, () => Promise.resolve('signed')), 'signed');
  assert.deepEqual(reports, []);
});

test('a dismissed browser passkey prompt is rethrown without a report', async () => {
  for (const signer of ['passkey create', 'passkey sign']) {
    const { reports, report } = recorder();
    const dismissed = new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError');
    await assert.rejects(
      reportingSigningFailure(signer, report, () => Promise.reject(dismissed)),
      dismissed,
    );
    assert.deepEqual(reports, []);
  }
});

test('a browser passkey error other than a dismissal is still reported', async () => {
  const { reports, report } = recorder();
  const failure = new DOMException('The authenticator is not usable.', 'InvalidStateError');
  await assert.rejects(
    reportingSigningFailure('passkey', report, () => Promise.reject(failure)),
    failure,
  );
  assert.deepEqual(reports, [{ error: failure, context: 'Signing with passkey' }]);
});
