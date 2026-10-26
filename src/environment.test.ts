import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LoopEnvironment } from './environment.ts';

describe('LoopEnvironment.resolve', () => {
  it('pairs staging with the CTX staging URL and testnet', () => {
    const environment = LoopEnvironment.resolve('staging');
    assert.equal(environment.name, 'staging');
    assert.equal(environment.ctxApiUrl, 'https://staging.spend.ctx.com');
    assert.equal(environment.stellarNetwork, 'testnet');
  });

  it('pairs production with the CTX production URL and mainnet', () => {
    const environment = LoopEnvironment.resolve('production');
    assert.equal(environment.name, 'production');
    assert.equal(environment.ctxApiUrl, 'https://spend.ctx.com');
    assert.equal(environment.stellarNetwork, 'mainnet');
  });

  it('rejects a missing value', () => {
    assert.throws(() => LoopEnvironment.resolve(undefined), /EXPO_PUBLIC_LOOP_ENV must be staging \| production, got nothing/);
  });

  it('rejects misspelled, cased and legacy values', () => {
    for (const value of ['', 'prod', 'Production', 'testnet', 'mainnet', ' staging']) {
      assert.throws(() => LoopEnvironment.resolve(value), /EXPO_PUBLIC_LOOP_ENV must be/);
    }
  });
});

describe('LoopEnvironment naming', () => {
  it('marks staging passkeys as test and leaves production unmarked', () => {
    assert.equal(LoopEnvironment.resolve('staging').passkeyLabel('ash@example.com'), 'ash@example.com (test)');
    assert.equal(LoopEnvironment.resolve('production').passkeyLabel('ash@example.com'), 'ash@example.com');
  });
});
