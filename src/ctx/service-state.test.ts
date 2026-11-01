import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  blockingServiceState,
  hasRecovered,
  recoveryProbe,
  serviceState,
  serviceStateMessages,
  type RecoveryChecks,
} from './service-state.ts';

test('each CTX switch error maps to its service state', () => {
  assert.equal(serviceState('ErrMaintenanceMode'), 'maintenance');
  assert.equal(serviceState('ErrKillSwitchActive'), 'purchases-paused');
  assert.equal(serviceState('ErrClientDisabled'), 'app-disabled');
});

test('other errors are not service states', () => {
  for (const name of [
    'ErrAmountBelowMinimum',
    'ErrPaymentAlreadySubmitted',
    'errmaintenancemode',
    'ErrMaintenanceMode ',
    'toString',
    '',
    undefined,
  ]) {
    assert.equal(serviceState(name), null, String(name));
    assert.equal(blockingServiceState(name), null, String(name));
  }
});

test('each service state has its own message', () => {
  assert.deepEqual(serviceStateMessages, {
    maintenance: 'Loop is down for maintenance',
    'purchases-paused': 'Gift card purchases are paused, try again later',
    'app-disabled': 'Loop is unavailable right now',
  });
});

test('only maintenance and app-disabled block the app', () => {
  assert.equal(blockingServiceState('ErrMaintenanceMode'), 'maintenance');
  assert.equal(blockingServiceState('ErrClientDisabled'), 'app-disabled');
  assert.equal(blockingServiceState('ErrKillSwitchActive'), null);
  assert.equal(blockingServiceState('ErrAmountBelowMinimum'), null);
});

test('maintenance recovers through the public status check', () => {
  assert.equal(recoveryProbe('maintenance', true), 'GET /status');
  assert.equal(recoveryProbe('maintenance', false), 'GET /status');
});

test('app-disabled recovers through the profile read when signed in, the catalog read otherwise', () => {
  assert.equal(recoveryProbe('app-disabled', true), 'GET /me');
  assert.equal(recoveryProbe('app-disabled', false), 'GET /merchants');
});

class FakeChecks implements RecoveryChecks {
  session: boolean;
  maintenanceOn = false;
  profileError: unknown = null;
  catalogError: unknown = null;
  statusCalls = 0;
  profileCalls = 0;
  catalogCalls = 0;
  sessionAfterProfile: boolean | null = null;

  constructor(session: boolean) {
    this.session = session;
  }

  async hasSession(): Promise<boolean> {
    return this.session;
  }

  async maintenance(): Promise<boolean> {
    this.statusCalls += 1;
    return this.maintenanceOn;
  }

  async readProfile(): Promise<unknown> {
    this.profileCalls += 1;
    if (this.sessionAfterProfile !== null) {
      this.session = this.sessionAfterProfile;
    }
    if (this.profileError) {
      throw this.profileError;
    }
    return {};
  }

  async readCatalog(): Promise<unknown> {
    this.catalogCalls += 1;
    if (this.catalogError) {
      throw this.catalogError;
    }
    return {};
  }

  isBlocking(error: unknown): boolean {
    return error === blockingError;
  }
}

const blockingError = new Error('blocked');

test('signed out, app-disabled checks the network before recovering', async () => {
  const checks = new FakeChecks(false);
  assert.equal(await hasRecovered('app-disabled', checks), true);
  assert.equal(checks.catalogCalls, 1);
  assert.equal(checks.statusCalls, 0);
  assert.equal(checks.profileCalls, 0);
});

test('signed out, app-disabled stays blocked while the catalog read is refused', async () => {
  const checks = new FakeChecks(false);
  checks.catalogError = blockingError;
  assert.equal(await hasRecovered('app-disabled', checks), false);
});

test('a catalog read failure surfaces as an error', async () => {
  const checks = new FakeChecks(false);
  checks.catalogError = new Error('offline');
  await assert.rejects(hasRecovered('app-disabled', checks), /offline/);
});

test('maintenance stays blocked while the status check reports it', async () => {
  const checks = new FakeChecks(false);
  checks.maintenanceOn = true;
  assert.equal(await hasRecovered('maintenance', checks), false);
  assert.equal(checks.catalogCalls, 0);
});

test('signed in, a blocking profile error stays blocked', async () => {
  const checks = new FakeChecks(true);
  checks.profileError = blockingError;
  assert.equal(await hasRecovered('app-disabled', checks), false);
});

test('signed in, an expired session on the profile read counts as recovered', async () => {
  const checks = new FakeChecks(true);
  checks.profileError = new Error('CTX 401');
  checks.sessionAfterProfile = false;
  assert.equal(await hasRecovered('app-disabled', checks), true);
});

test('signed in, other profile errors surface while the session holds', async () => {
  const checks = new FakeChecks(true);
  checks.profileError = new Error('CTX 500');
  await assert.rejects(hasRecovered('app-disabled', checks), /CTX 500/);
});

test('signed in, a readable profile recovers without touching the status or catalog checks', async () => {
  const checks = new FakeChecks(true);
  assert.equal(await hasRecovered('app-disabled', checks), true);
  assert.deepEqual([checks.statusCalls, checks.profileCalls, checks.catalogCalls], [0, 1, 0]);
});

test('signed in, a blocking profile error stays blocked even when the session is gone', async () => {
  const checks = new FakeChecks(true);
  checks.profileError = blockingError;
  checks.sessionAfterProfile = false;
  assert.equal(await hasRecovered('app-disabled', checks), false);
  assert.deepEqual([checks.statusCalls, checks.profileCalls, checks.catalogCalls], [0, 1, 0]);
});

test('maintenance recovers through the status check whether or not a session exists', async () => {
  for (const session of [true, false]) {
    const checks = new FakeChecks(session);
    assert.equal(await hasRecovered('maintenance', checks), true);
    assert.deepEqual([checks.statusCalls, checks.profileCalls, checks.catalogCalls], [1, 0, 0]);
  }
});

test('a failing status check surfaces as an error instead of reading as recovered', async () => {
  const checks = new FakeChecks(true);
  checks.maintenance = async () => {
    throw new Error('offline');
  };
  await assert.rejects(hasRecovered('maintenance', checks), /offline/);
});

test('a catalog read that succeeds recovers a signed-out app-disabled state exactly once', async () => {
  const checks = new FakeChecks(false);
  assert.equal(await hasRecovered('app-disabled', checks), true);
  assert.deepEqual([checks.statusCalls, checks.profileCalls, checks.catalogCalls], [0, 0, 1]);
});
