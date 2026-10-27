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

test('a token written after a fresh-install read is kept', async () => {
  const secure = memoryStorage();
  const token = new InstallScopedToken(secure, memoryStorage(), 'refresh');
  assert.equal(await token.read(), null);
  await token.write('abc');
  assert.equal(await token.read(), 'abc');
});

test('clear removes the token', async () => {
  const token = new InstallScopedToken(memoryStorage(), memoryStorage(), 'refresh');
  await token.write('abc');
  await token.clear();
  assert.equal(await token.read(), null);
});
