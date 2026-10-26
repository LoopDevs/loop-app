import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  blockingServiceState,
  recoveryProbe,
  serviceState,
  type BlockingServiceState,
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

test('app-disabled recovers through the profile read when signed in, sign-in otherwise', () => {
  assert.equal(recoveryProbe('app-disabled', true), 'GET /me');
  assert.equal(recoveryProbe('app-disabled', false), 'sign-in');
});

test('recovery never sends a write', () => {
  const states: BlockingServiceState[] = ['maintenance', 'app-disabled'];
  for (const state of states) {
    for (const signedIn of [true, false]) {
      assert.ok(['GET /status', 'GET /me', 'sign-in'].includes(recoveryProbe(state, signedIn)));
    }
  }
});
