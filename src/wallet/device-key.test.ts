import { ed25519 } from '@noble/curves/ed25519';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { base64 } from './base64.ts';
import { DeviceKey, type DeviceKeyStorage } from './device-key.ts';

class MemoryStorage implements DeviceKeyStorage {
  readonly entries = new Map<string, { value: string; biometric: boolean }>();
  readonly touched: string[] = [];

  async read(name: string): Promise<string | null> {
    return this.entries.get(name)?.value ?? null;
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

test('a user with no key cannot sign', async () => {
  const storage = new MemoryStorage();
  await new DeviceKey(storage, 'a').create();
  await assert.rejects(new DeviceKey(storage, 'b').sign(digest));
  assert.equal(await new DeviceKey(storage, 'b').publicKey(), null);
});
