import assert from 'node:assert/strict';
import { test } from 'node:test';

import { InstallScopedToken, type TokenStorage } from './install-scoped-token.ts';

function memoryStorage(): TokenStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
  };
}

test('a written token is read back on the same install', async () => {
  const token = new InstallScopedToken(memoryStorage(), memoryStorage(), 'refresh');
  await token.write('abc');
  assert.equal(await token.read(), 'abc');
});

test('a token left in secure storage from a deleted install is wiped and not read', async () => {
  const secure = memoryStorage();
  await new InstallScopedToken(secure, memoryStorage(), 'refresh').write('abc');
  const reinstalled = new InstallScopedToken(secure, memoryStorage(), 'refresh');
  assert.equal(await reinstalled.read(), null);
  assert.equal(secure.values.has('refresh'), false);
});

test('a token from a deleted install is wiped when this install only wrote a different key', async () => {
  const secure = memoryStorage();
  await new InstallScopedToken(secure, memoryStorage(), 'refresh.production').write('old');
  const appStorage = memoryStorage();
  await new InstallScopedToken(secure, appStorage, 'refresh.staging').write('new');
  const production = new InstallScopedToken(secure, appStorage, 'refresh.production');
  assert.equal(await production.read(), null);
  assert.equal(secure.values.has('refresh.production'), false);
});

test('a token written after a fresh-install read is kept', async () => {
  const secure = memoryStorage();
  const token = new InstallScopedToken(secure, memoryStorage(), 'refresh');
  assert.equal(await token.read(), null);
  await token.write('abc');
  assert.equal(await token.read(), 'abc');
});

test('a sign-in write during a slow fresh-install read keeps the new token', async () => {
  const secure = memoryStorage();
  const appStorage = memoryStorage();
  let releaseRead = () => {};
  const slowAppStorage: TokenStorage = {
    ...appStorage,
    async getItem(key) {
      const value = await appStorage.getItem(key);
      await new Promise<void>((resolve) => {
        releaseRead = resolve;
      });
      return value;
    },
  };
  const token = new InstallScopedToken(secure, slowAppStorage, 'refresh');
  const read = token.read();
  const write = token.write('abc');
  await new Promise((resolve) => setImmediate(resolve));
  releaseRead();
  assert.equal(await read, null);
  await write;
  assert.equal(secure.values.get('refresh'), 'abc');
});

test('clear removes the token', async () => {
  const token = new InstallScopedToken(memoryStorage(), memoryStorage(), 'refresh');
  await token.write('abc');
  await token.clear();
  assert.equal(await token.read(), null);
});
