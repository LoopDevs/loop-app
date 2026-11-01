import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

  it('carries the CTX client id in both environments', () => {
    assert.equal(LoopEnvironment.resolve('staging').ctxClientId, 'loopapp');
    assert.equal(LoopEnvironment.resolve('production').ctxClientId, 'loopapp');
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

describe('LoopEnvironment release channels', () => {
  type BuildProfile = { channel?: string; env?: Record<string, string> };
  const easConfig: { build: Record<string, BuildProfile> } = JSON.parse(
    readFileSync(new URL('../eas.json', import.meta.url), 'utf8'),
  );

  function environmentsForChannel(channel: string): string[] {
    const names = Object.values(easConfig.build)
      .filter((profile) => profile.channel === channel)
      .map((profile) => LoopEnvironment.resolve(profile.env?.EXPO_PUBLIC_LOOP_ENV).name);
    return [...new Set(names)];
  }

  it('pins one Loop environment per release channel in eas.json', () => {
    assert.deepEqual(environmentsForChannel('preview'), ['staging']);
    assert.deepEqual(environmentsForChannel('production'), ['production']);
  });
});

describe('LoopEnvironment naming', () => {
  it('marks staging passkeys as test and leaves production unmarked', () => {
    assert.equal(LoopEnvironment.resolve('staging').passkeyLabel('ash@example.com'), 'ash@example.com (test)');
    assert.equal(LoopEnvironment.resolve('production').passkeyLabel('ash@example.com'), 'ash@example.com');
  });
});

describe('LoopEnvironment storage keys', () => {
  it('keeps staging and production values apart on a shared install', () => {
    assert.equal(LoopEnvironment.resolve('staging').storageKey('ctx.refreshToken'), 'ctx.refreshToken.staging');
    assert.equal(LoopEnvironment.resolve('production').storageKey('ctx.refreshToken'), 'ctx.refreshToken.production');
  });
});
