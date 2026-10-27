import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PasskeySite } from './passkey-site.ts';

test('native and every hosted web address use loopfinance.io', () => {
  assert.equal(PasskeySite.forHost(null), 'loopfinance.io');
  assert.equal(PasskeySite.forHost('loopfinance.io'), 'loopfinance.io');
  assert.equal(PasskeySite.forHost('beta.loopfinance.io'), 'loopfinance.io');
  assert.equal(PasskeySite.forHost('preview.loop-app.pages.dev'), 'loopfinance.io');
});

test('local development uses its own address', () => {
  assert.equal(PasskeySite.forHost('localhost'), 'localhost');
  assert.equal(PasskeySite.forHost('loop.localhost'), 'loop.localhost');
});

test('a host that only looks local uses loopfinance.io', () => {
  assert.equal(PasskeySite.forHost('localhost.evil.com'), 'loopfinance.io');
  assert.equal(PasskeySite.forHost('evillocalhost'), 'loopfinance.io');
});
