import assert from 'node:assert/strict';
import { test } from 'node:test';

import { network } from '../stellar/network.ts';
import { WalletRules, type ContextRule, type WalletReading } from './wallet-rules.ts';

const passkeyKey = new Uint8Array(65).fill(4);
const deviceKey = new Uint8Array(32).fill(1);
const otherDeviceKey = new Uint8Array(32).fill(2);

function rule(id: number, verifier: string, key: Uint8Array): ContextRule {
  return { id, signers: [['External', verifier, key]], valid_until: undefined };
}

function reading(overrides: Partial<WalletReading> = {}): WalletReading {
  return {
    wasmHash: network.accountWasmHash,
    ruleCount: 2,
    passkeyRule: rule(0, network.webauthnVerifier, passkeyKey),
    deviceRule: rule(1, network.ed25519Verifier, deviceKey),
    ...overrides,
  };
}

test('a device holding the key in the device rule is linked', () => {
  const checked = WalletRules.check(reading(), passkeyKey, deviceKey);
  assert.equal(checked.thisDevice, 'linked');
  assert.deepEqual(checked.passkeyPublicKey, passkeyKey);
});

test('a device with no key is reported unlinked, not failed', () => {
  const checked = WalletRules.check(reading(), undefined, null);
  assert.equal(checked.thisDevice, 'unlinked');
  assert.deepEqual(checked.passkeyPublicKey, passkeyKey);
});

test('a device whose key was replaced by another device is reported unlinked', () => {
  assert.equal(WalletRules.check(reading(), passkeyKey, otherDeviceKey).thisDevice, 'unlinked');
});

test('an unexpected wallet still fails before the device is considered', () => {
  assert.throws(() => WalletRules.check(reading({ wasmHash: 'ff' }), undefined, null), /unexpected code/);
  assert.throws(() => WalletRules.check(reading({ ruleCount: 3 }), undefined, null), /unexpected rules/);
  assert.throws(
    () => WalletRules.check(reading(), new Uint8Array(65).fill(9), null),
    /rule 0 holds a different key/,
  );
  const wrongVerifier = reading({ deviceRule: rule(1, network.webauthnVerifier, deviceKey) });
  assert.throws(() => WalletRules.check(wrongVerifier, undefined, null), /rule 1 uses an unexpected verifier/);
});

test('the device rule is checked for the new key', () => {
  const deviceRule = rule(1, network.ed25519Verifier, deviceKey);
  assert.equal(WalletRules.holdsDeviceKey(deviceRule, deviceKey), true);
  assert.equal(WalletRules.holdsDeviceKey(deviceRule, otherDeviceKey), false);
});
