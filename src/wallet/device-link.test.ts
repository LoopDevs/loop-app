import assert from 'node:assert/strict';
import { test } from 'node:test';

import { p256 } from '@noble/curves/nist';
import { sha256 } from '@noble/hashes/sha2';
import { concatBytes, randomBytes } from '@noble/hashes/utils';
import { xdr } from '@stellar/stellar-sdk';

import type { SignedTransaction, SmartWalletIntent } from '../ctx/client.ts';
import { network } from '../stellar/network.ts';
import { base64 } from './base64.ts';
import { DeviceLink, type DeviceLinkDeps } from './device-link.ts';
import { PasskeyAssertion } from './passkey-assertion.ts';
import { expiry, latestLedger, otherWallet, rotationBuilt, wallet, type RotationShape } from './rotation.fixture.ts';
import type { ContextRule } from './wallet-rules.ts';

const passkeySecret = p256.utils.randomPrivateKey();
const passkeyPublicKey = p256.getPublicKey(passkeySecret, false);
const newKey = new Uint8Array(32).fill(7);
const oldKey = new Uint8Array(32).fill(3);

function signedBy(secret: Uint8Array, challenge: Uint8Array): PasskeyAssertion {
  const authenticatorData = randomBytes(37);
  const clientDataJson = new TextEncoder().encode(
    JSON.stringify({ type: 'webauthn.get', challenge: PasskeyAssertion.challengeOf(challenge) }),
  );
  const signature = p256.sign(concatBytes(authenticatorData, sha256(clientDataJson)), secret, { lowS: true });
  return PasskeyAssertion.fromResponse({
    authenticatorData: base64.encodeUrl(authenticatorData),
    clientDataJSON: base64.encodeUrl(clientDataJson),
    signature: base64.encodeUrl(signature.toBytes('der')),
  });
}

function deviceRule(key: Uint8Array): ContextRule {
  return { id: 1, signers: [['External', network.ed25519Verifier, key]], valid_until: undefined };
}

type Options = {
  shape?: RotationShape;
  builtKey?: Uint8Array;
  passkeySecret?: Uint8Array;
  ledgers?: number[];
};

function harness(options: Options = {}) {
  const calls = {
    intents: [] as SmartWalletIntent[],
    challenges: [] as Uint8Array[],
    sponsored: [] as SignedTransaction[],
    ruleReads: 0,
  };
  const ledgers = [...(options.ledgers ?? [])];
  const deps: DeviceLinkDeps = {
    async createDeviceKey() {
      return base64.encode(newKey);
    },
    async buildTransaction(intent) {
      calls.intents.push(intent);
      return rotationBuilt(options.builtKey ?? newKey, options.shape);
    },
    async sponsorTransaction(_intent, signed) {
      calls.sponsored.push(signed);
      return { hash: 'abc', status: 'pending' };
    },
    async signWithPasskey(challenge) {
      calls.challenges.push(challenge);
      return signedBy(options.passkeySecret ?? passkeySecret, challenge);
    },
    async latestLedger() {
      return ledgers.shift() ?? latestLedger;
    },
    async deviceRule() {
      calls.ruleReads += 1;
      if (calls.ruleReads === 1) {
        throw new Error('rpc unavailable');
      }
      return deviceRule(calls.ruleReads >= 3 ? newKey : oldKey);
    },
    async sleep() {},
  };
  return { link: new DeviceLink(deps), calls };
}

test('a device is added with a rotation to the key it just generated', async () => {
  const { link, calls } = harness();
  await link.add(wallet, passkeyPublicKey);
  assert.deepEqual(calls.intents, [{ intent: 'rotate_device', newDevicePublicKey: base64.encode(newKey) }]);
  assert.equal(calls.challenges.length, 1);
  assert.equal(calls.sponsored.length, 1);
  const [signed] = calls.sponsored;
  assert.ok('passkey' in signed);
  assert.equal(signed.passkey.publicKey, base64.encode(passkeyPublicKey));
  assert.equal(calls.ruleReads, 3);
});

test('the passkey is never asked to sign a rotation to another key', async () => {
  const { link, calls } = harness({ builtKey: new Uint8Array(32).fill(9) });
  await assert.rejects(link.add(wallet, passkeyPublicKey), /different key/);
  assert.equal(calls.challenges.length, 0);
  assert.equal(calls.sponsored.length, 0);
});

test('the passkey is never asked to sign a call on another wallet or another function', async () => {
  for (const shape of [{ contract: otherWallet }, { method: 'recovery_cancel' }]) {
    const { link, calls } = harness({ shape });
    await assert.rejects(link.add(wallet, passkeyPublicKey));
    assert.equal(calls.challenges.length, 0);
  }
  const { link, calls } = harness({ shape: { args: [xdr.ScVal.scvU32(1)] } });
  await assert.rejects(link.add(wallet, passkeyPublicKey), /different key/);
  assert.equal(calls.challenges.length, 0);
});

test('a signature by another passkey is checked before anything is sponsored', async () => {
  const { link, calls } = harness({ passkeySecret: p256.utils.randomPrivateKey() });
  await assert.rejects(link.add(wallet, passkeyPublicKey), /sign-in you set Loop up with/);
  assert.equal(calls.challenges.length, 1);
  assert.equal(calls.sponsored.length, 0);
});

test('the wait fails once the authorization has expired', async () => {
  const { link } = harness({ ledgers: [latestLedger, expiry + 1] });
  await assert.rejects(link.add(wallet, passkeyPublicKey), /timed out/);
});

test('the wait stops when it is aborted', async () => {
  const { link, calls } = harness();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(link.add(wallet, passkeyPublicKey, controller.signal), /interrupted/);
  assert.equal(calls.sponsored.length, 1);
});
