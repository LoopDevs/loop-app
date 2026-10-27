import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PasskeySite } from './passkey-site.ts';

test('native and every hosted web address use loopfinance.io', () => {
  for (const environment of ['staging', 'production'] as const) {
    assert.equal(PasskeySite.forHost(null, environment), 'loopfinance.io');
    assert.equal(PasskeySite.forHost('loopfinance.io', environment), 'loopfinance.io');
    assert.equal(PasskeySite.forHost('beta.loopfinance.io', environment), 'loopfinance.io');
    assert.equal(PasskeySite.forHost('preview.loop-app.pages.dev', environment), 'loopfinance.io');
  }
});

test('local development on staging uses its own address', () => {
  assert.equal(PasskeySite.forHost('localhost', 'staging'), 'localhost');
  assert.equal(PasskeySite.forHost('loop.localhost', 'staging'), 'loop.localhost');
});

test('a production build uses loopfinance.io even on a local address', () => {
  assert.equal(PasskeySite.forHost('localhost', 'production'), 'loopfinance.io');
  assert.equal(PasskeySite.forHost('loop.localhost', 'production'), 'loopfinance.io');
});

test('a host that only looks local uses loopfinance.io', () => {
  assert.equal(PasskeySite.forHost('localhost.evil.com', 'staging'), 'loopfinance.io');
  assert.equal(PasskeySite.forHost('evillocalhost', 'staging'), 'loopfinance.io');
});
