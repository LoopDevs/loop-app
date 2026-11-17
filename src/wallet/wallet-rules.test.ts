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

test('a wallet running the first account code is rejected', () => {
  const firstAccountWasmHash = 'de8d8b4f80ef1d45814fcb54d8d713216a00a29e8f6a6e87f3e26256494eed53';
  assert.throws(
    () => WalletRules.check(reading({ wasmHash: firstAccountWasmHash }), passkeyKey, deviceKey),
    /unexpected code/,
  );
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

test('a rule with no signer or more than one signer is refused', () => {
  const none = { ...rule(1, network.ed25519Verifier, deviceKey), signers: [] };
  assert.throws(() => WalletRules.holdsDeviceKey(none, deviceKey), /rule 1 is not a single permanent signer/);
  const two = {
    ...rule(1, network.ed25519Verifier, deviceKey),
    signers: [
      ['External', network.ed25519Verifier, deviceKey],
      ['External', network.ed25519Verifier, otherDeviceKey],
    ] as ContextRule['signers'],
  };
  assert.throws(() => WalletRules.holdsDeviceKey(two, deviceKey), /rule 1 is not a single permanent signer/);
});

test('a rule that expires is refused and one with no expiry is accepted', () => {
  const expiring = { ...rule(1, network.ed25519Verifier, deviceKey), valid_until: 5_000_000 };
  assert.throws(() => WalletRules.holdsDeviceKey(expiring, deviceKey), /rule 1 is not a single permanent signer/);
  const expiringAtZero = { ...rule(1, network.ed25519Verifier, deviceKey), valid_until: 0 };
  assert.throws(() => WalletRules.holdsDeviceKey(expiringAtZero, deviceKey), /not a single permanent signer/);
  const permanent = { ...rule(1, network.ed25519Verifier, deviceKey), valid_until: null };
  assert.equal(WalletRules.holdsDeviceKey(permanent, deviceKey), true);
});

test('a rule whose signer is not an external key is refused', () => {
  const delegated = {
    ...rule(1, network.ed25519Verifier, deviceKey),
    signers: [['Delegated', network.ed25519Verifier, deviceKey]] as ContextRule['signers'],
  };
  assert.throws(() => WalletRules.holdsDeviceKey(delegated, deviceKey), /rule 1 uses an unexpected verifier/);
});

test('a rule whose signer uses another verifier is refused for the device and the passkey', () => {
  const otherVerifier = rule(1, network.webauthnVerifier, deviceKey);
  assert.throws(() => WalletRules.holdsDeviceKey(otherVerifier, deviceKey), /rule 1 uses an unexpected verifier/);
  const passkeyOnDeviceVerifier = reading({ passkeyRule: rule(0, network.ed25519Verifier, passkeyKey) });
  assert.throws(
    () => WalletRules.check(passkeyOnDeviceVerifier, passkeyKey, null),
    /rule 0 uses an unexpected verifier/,
  );
});

test('a wallet whose passkey rule has no known passkey key accepts the key it holds', () => {
  assert.deepEqual(WalletRules.check(reading(), undefined, null).passkeyPublicKey, passkeyKey);
});
