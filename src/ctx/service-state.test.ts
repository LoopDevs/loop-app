import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  blockingServiceState,
  hasRecovered,
  recoveryProbe,
  serviceState,
  type BlockingServiceState,
  type RecoveryChecks,
} from './service-state.ts';

test('each CTX switch error maps to its service state', () => {
  assert.equal(serviceState('ErrMaintenanceMode'), 'maintenance');
  assert.equal(serviceState('ErrKillSwitchActive'), 'purchases-paused');
  assert.equal(serviceState('ErrClientDisabled'), 'app-disabled');
});

test('other errors are not service states', () => {
  assert.equal(serviceState('ErrAmountBelowMinimum'), null);
  assert.equal(serviceState('ErrPaymentAlreadySubmitted'), null);
  assert.equal(serviceState(undefined), null);
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

test('app-disabled recovers through the profile read when signed in, the status check otherwise', () => {
  assert.equal(recoveryProbe('app-disabled', true), 'GET /me');
  assert.equal(recoveryProbe('app-disabled', false), 'GET /status');
});

test('recovery never sends a write', () => {
  const states: BlockingServiceState[] = ['maintenance', 'app-disabled'];
  for (const state of states) {
    for (const signedIn of [true, false]) {
      assert.ok(['GET /status', 'GET /me'].includes(recoveryProbe(state, signedIn)));
    }
  }
});

class FakeChecks implements RecoveryChecks {
  session: boolean;
  maintenanceOn = false;
  profileError: unknown = null;
  statusCalls = 0;
  profileCalls = 0;
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

  isBlocking(error: unknown): boolean {
    return error === blockingError;
  }
}

const blockingError = new Error('blocked');

test('signed out, app-disabled checks the network before recovering', async () => {
  const checks = new FakeChecks(false);
  assert.equal(await hasRecovered('app-disabled', checks), true);
  assert.equal(checks.statusCalls, 1);
  assert.equal(checks.profileCalls, 0);
});

test('signed out, app-disabled stays blocked while the status check reports maintenance', async () => {
  const checks = new FakeChecks(false);
  checks.maintenanceOn = true;
  assert.equal(await hasRecovered('app-disabled', checks), false);
});

test('a status check failure surfaces as an error', async () => {
  const checks = new FakeChecks(false);
  checks.maintenance = async () => {
    throw new Error('offline');
  };
  await assert.rejects(hasRecovered('app-disabled', checks), /offline/);
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
