import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SealedDeviceKey, SecretMismatch } from './sealed-device-key.ts';

const secret = () => crypto.getRandomValues(new Uint8Array(32));
const digest = crypto.getRandomValues(new Uint8Array(32));

async function verifies(publicKey: Uint8Array<ArrayBuffer>, signature: Uint8Array<ArrayBuffer>): Promise<boolean> {
  const key = await crypto.subtle.importKey('raw', publicKey, { name: 'Ed25519' }, false, ['verify']);
  return crypto.subtle.verify({ name: 'Ed25519' }, key, signature, digest);
}

test('a sealed key signs with the secret it was sealed under', async () => {
  const unlock = secret();
  const key = await SealedDeviceKey.seal('credential', SealedDeviceKey.newSalt(), unlock);

  const signature = await key.sign(unlock, digest);

  assert.equal(await verifies(key.record.publicKey, new Uint8Array(signature)), true);
});

test('a sealed key refuses to sign with any other secret', async () => {
  const key = await SealedDeviceKey.seal('credential', SealedDeviceKey.newSalt(), secret());

  await assert.rejects(key.sign(secret(), digest), SecretMismatch);
});

test('the stored record holds only the public key and the sealed private key', async () => {
  const key = await SealedDeviceKey.seal('credential', SealedDeviceKey.newSalt(), secret());

  assert.deepEqual(Object.keys(key.record).sort(), ['credentialId', 'iv', 'publicKey', 'salt', 'sealed']);
  assert.equal(
    Object.values(key.record).some((value) => value instanceof CryptoKey),
    false,
  );
});

test('a stored record signs after a structured clone round trip', async () => {
  const unlock = secret();
  const key = await SealedDeviceKey.seal('credential', SealedDeviceKey.newSalt(), unlock);

  const restored = SealedDeviceKey.from(structuredClone(key.record));

  assert.ok(restored);
  const signature = await restored.sign(unlock, digest);
  assert.equal(await verifies(key.record.publicKey, new Uint8Array(signature)), true);
});

test('a stored key pair without a sealed key is not a device key', async () => {
  const keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);

  assert.equal(SealedDeviceKey.from(keyPair), null);
  assert.equal(SealedDeviceKey.from(undefined), null);
});

test('a key sealed under one salt does not open under another', async () => {
  const unlock = secret();
  const key = await SealedDeviceKey.seal('credential', SealedDeviceKey.newSalt(), unlock);
  const moved = SealedDeviceKey.from({ ...key.record, salt: SealedDeviceKey.newSalt() });

  assert.ok(moved);
  await assert.rejects(moved.sign(unlock, digest), SecretMismatch);
});
