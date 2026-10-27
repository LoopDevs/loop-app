import assert from 'node:assert/strict';
import { test } from 'node:test';

import { WalletPin } from '../wallet/wallet-pin.ts';
import { FavouriteIds } from './favourite-ids.ts';
import { LocalAccountData } from './local-account-data.ts';

function deviceWithTwoUsers() {
  const values = new Map<string, string>();
  const deviceKeys = new Set(['user-a', 'user-b']);
  const storage = {
    async getItem(key: string) {
      return values.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      values.set(key, value);
    },
    async removeItem(key: string) {
      values.delete(key);
    },
  };
  for (const userId of deviceKeys) {
    values.set(FavouriteIds.storageKey(userId), '["m1"]');
    values.set(new WalletPin(storage, userId).key, '{"address":"C","passkeyPublicKey":"k"}');
  }
  values.set('market.country', 'GB');
  const removeDeviceKey = async (userId: string) => {
    deviceKeys.delete(userId);
  };
  return { values, storage, deviceKeys, data:(userId: string) => new LocalAccountData({ storage, removeDeviceKey }, userId) };
}

test('forgetting a user removes their favourites, wallet pin and device key', async () => {
  const device = deviceWithTwoUsers();
  await device.data('user-a').forget();
  assert.equal(device.values.has(FavouriteIds.storageKey('user-a')), false);
  assert.equal(device.values.has(new WalletPin(device.storage, 'user-a').key), false);
  assert.equal(device.deviceKeys.has('user-a'), false);
});

test('forgetting a user leaves another user and device settings in place', async () => {
  const device = deviceWithTwoUsers();
  await device.data('user-a').forget();
  assert.equal(device.values.get(FavouriteIds.storageKey('user-b')), '["m1"]');
  assert.equal(device.values.has(new WalletPin(device.storage, 'user-b').key), true);
  assert.equal(device.deviceKeys.has('user-b'), true);
  assert.equal(device.values.get('market.country'), 'GB');
});

test('a device key that fails to go reports the failure', async () => {
  const data = new LocalAccountData(
    {
      storage: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined },
      removeDeviceKey: () => Promise.reject(new Error('keychain locked')),
    },
    'user-a',
  );
  await assert.rejects(data.forget(), /keychain locked/);
});
