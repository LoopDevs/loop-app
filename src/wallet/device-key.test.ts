import { ed25519 } from '@noble/curves/ed25519';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { base64 } from './base64.ts';
import { DeviceKey, IdentityNotConfirmed, MissingDeviceSecret, type DeviceKeyStorage } from './device-key.ts';

class MemoryStorage implements DeviceKeyStorage {
  readonly entries = new Map<string, { value: string; biometric: boolean }>();
  readonly touched: string[] = [];

  async read(name: string, biometric: boolean): Promise<string | null> {
    const entry = this.entries.get(name);
    if (entry && entry.biometric !== biometric) {
      throw new Error(`${name} read with the wrong biometric flag`);
    }
    return entry?.value ?? null;
  }

  async write(name: string, value: string, biometric: boolean): Promise<void> {
    this.touched.push(name);
    this.entries.set(name, { value, biometric });
  }

  async remove(name: string): Promise<void> {
    this.touched.push(name);
    this.entries.delete(name);
  }
}

const digest = new Uint8Array(32).fill(7);

test('key names include the user id', () => {
  const key = new DeviceKey(new MemoryStorage(), 'user-a');
  assert.equal(key.secretName, 'device.signer.user-a.secret');
  assert.equal(key.publicKeyName, 'device.signer.user-a.public');
});

test('different users get different key names', () => {
  const storage = new MemoryStorage();
  const a = new DeviceKey(storage, 'a');
  const b = new DeviceKey(storage, 'b');
  assert.notEqual(a.secretName, b.secretName);
  assert.notEqual(a.publicKeyName, b.publicKeyName);
});

test('a user id that is empty or outside the key alphabet is rejected', () => {
  for (const userId of ['', 'a.b', 'a/b', 'a b', 'a:b']) {
    assert.throws(() => new DeviceKey(new MemoryStorage(), userId));
  }
});

test('the secret is stored behind biometrics and the public key is not', async () => {
  const storage = new MemoryStorage();
  const key = new DeviceKey(storage, 'a');
  await key.create();
  assert.equal(storage.entries.get(key.secretName)?.biometric, true);
  assert.equal(storage.entries.get(key.publicKeyName)?.biometric, false);
});

test('removing user A key leaves user B and the shared key able to sign', async () => {
  const storage = new MemoryStorage();
  const a = new DeviceKey(storage, 'a');
  const b = new DeviceKey(storage, 'b');
  await a.create();
  const bPublicKey = await b.create();
  storage.entries.set(DeviceKey.sharedPublicKeyName, { value: bPublicKey, biometric: false });

  await a.remove();

  assert.equal(storage.entries.has(a.secretName), false);
  assert.equal(storage.entries.has(a.publicKeyName), false);
  assert.equal(await b.publicKey(), bPublicKey);
  assert.equal(storage.entries.get(DeviceKey.sharedPublicKeyName)?.value, bPublicKey);
});

test('creating a key for user B never touches user A key', async () => {
  const storage = new MemoryStorage();
  const a = new DeviceKey(storage, 'a');
  const aPublicKey = await a.create();
  const aSecret = storage.entries.get(a.secretName)?.value;
  storage.touched.length = 0;

  const b = new DeviceKey(storage, 'b');
  const bPublicKey = await b.create();

  assert.ok(storage.touched.every((name) => name === b.secretName || name === b.publicKeyName));
  assert.equal(storage.entries.get(a.secretName)?.value, aSecret);
  assert.equal(await a.publicKey(), aPublicKey);
  assert.notEqual(bPublicKey, aPublicKey);
  const signature = base64.decode(await a.sign(digest));
  assert.ok(ed25519.verify(signature, digest, base64.decode(aPublicKey)));
});

test('each user signs with their own key', async () => {
  const storage = new MemoryStorage();
  const a = new DeviceKey(storage, 'a');
  const b = new DeviceKey(storage, 'b');
  const aPublicKey = await a.create();
  const bPublicKey = await b.create();
  const bSignature = base64.decode(await b.sign(digest));
  assert.ok(ed25519.verify(bSignature, digest, base64.decode(bPublicKey)));
  assert.equal(ed25519.verify(bSignature, digest, base64.decode(aPublicKey)), false);
});

test('a user with no own key uses the shared key a wallet was created with', async () => {
  const storage = new MemoryStorage();
  const secret = new Uint8Array(32).fill(3);
  const sharedPublicKey = base64.encode(ed25519.getPublicKey(secret));
  await storage.write(DeviceKey.sharedSecretName, base64.encode(secret), true);
  await storage.write(DeviceKey.sharedPublicKeyName, sharedPublicKey, false);

  const a = new DeviceKey(storage, 'a');
  assert.equal(await a.publicKey(), sharedPublicKey);
  const signature = base64.decode(await a.sign(digest));
  assert.ok(ed25519.verify(signature, digest, base64.decode(sharedPublicKey)));
});

test('creating an own key leaves the shared key in place and takes precedence', async () => {
  const storage = new MemoryStorage();
  const secret = new Uint8Array(32).fill(3);
  await storage.write(DeviceKey.sharedSecretName, base64.encode(secret), true);
  await storage.write(DeviceKey.sharedPublicKeyName, base64.encode(ed25519.getPublicKey(secret)), false);

  const b = new DeviceKey(storage, 'b');
  const bPublicKey = await b.create();
  assert.equal(await b.publicKey(), bPublicKey);
  const signature = base64.decode(await b.sign(digest));
  assert.ok(ed25519.verify(signature, digest, base64.decode(bPublicKey)));
  assert.ok(storage.entries.has(DeviceKey.sharedSecretName));
});

test('a user with no key cannot sign', async () => {
  const storage = new MemoryStorage();
  await new DeviceKey(storage, 'a').create();
  await assert.rejects(new DeviceKey(storage, 'b').sign(digest));
  assert.equal(await new DeviceKey(storage, 'b').publicKey(), null);
});

test('a secret dropped by the OS removes the public key so the device reads as unlinked', async () => {
  const storage = new MemoryStorage();
  const key = new DeviceKey(storage, 'a');
  await key.create();
  storage.entries.delete(key.secretName);
  await assert.rejects(key.sign(digest), MissingDeviceSecret);
  assert.equal(await key.publicKey(), null);
});

test('a dropped shared secret removes the shared public key', async () => {
  const storage = new MemoryStorage();
  await storage.write(DeviceKey.sharedPublicKeyName, 'shared', false);
  await assert.rejects(new DeviceKey(storage, 'a').sign(digest), MissingDeviceSecret);
  assert.equal(await new DeviceKey(storage, 'a').publicKey(), null);
});

test('creating again keeps the existing key so a wallet deployed with it stays usable', async () => {
  const storage = new MemoryStorage();
  const key = new DeviceKey(storage, 'a');
  const first = await key.create();
  const signature = await key.sign(digest);
  assert.equal(await key.create(), first);
  assert.equal(await key.sign(digest), signature);
});

test('creating after the OS dropped the secret makes a new key', async () => {
  const storage = new MemoryStorage();
  const key = new DeviceKey(storage, 'a');
  const first = await key.create();
  storage.entries.delete(key.secretName);
  await assert.rejects(key.sign(digest), MissingDeviceSecret);
  const second = await key.create();
  assert.notEqual(second, first);
  assert.ok(ed25519.verify(base64.decode(await key.sign(digest)), digest, base64.decode(second)));
});

test('a cancelled Face ID or fingerprint prompt reads as not confirmed and other errors pass through', () => {
  const iosCanceled = IdentityNotConfirmed.from(
    new Error("Calling the 'getValueWithKeyAsync' function has failed\n→ Caused by: User canceled the operation."),
  );
  const androidCanceled = IdentityNotConfirmed.from(
    new Error(
      "Call to function 'ExpoSecureStore.getValueWithKeyAsync' has been rejected.\n→ Caused by: Could not authenticate the user: User canceled the authentication",
    ),
  );
  const lockedOut = new Error(
    "Call to function 'ExpoSecureStore.getValueWithKeyAsync' has been rejected.\n→ Caused by: Could not authenticate the user: Lockout permanent",
  );
  assert.ok(iosCanceled instanceof IdentityNotConfirmed);
  assert.ok(androidCanceled instanceof IdentityNotConfirmed);
  assert.equal(IdentityNotConfirmed.from(lockedOut), lockedOut);
});
