import assert from 'node:assert/strict';
import { test } from 'node:test';

import { WalletPin, type WalletPinStorage } from './wallet-pin.ts';

function memoryStorage(): WalletPinStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
  };
}

const link = (address: string, overrides: Partial<{ sponsored: boolean; chain: string; status: string }> = {}) => ({
  id: address,
  address,
  chain: 'XLM',
  sponsored: true,
  status: 'active',
  ...overrides,
});

const pinned = { address: 'CMINE', passkeyPublicKey: 'key' };

test('without a pin the first active sponsored Stellar wallet is chosen', () => {
  const links = [link('CA', { sponsored: false }), link('CB', { status: 'inactive' }), link('CC')];
  assert.equal(WalletPin.choose(links, null)?.address, 'CC');
  assert.equal(WalletPin.choose([], null), null);
});

test('with a pin the pinned wallet is chosen even when CTX lists another first', () => {
  assert.equal(WalletPin.choose([link('COTHER'), link('CMINE')], pinned)?.address, 'CMINE');
});

test('with a pin a list that swaps or hides the pinned wallet is refused', () => {
  assert.throws(() => WalletPin.choose([link('COTHER')], pinned), /no longer lists the wallet/);
  assert.throws(() => WalletPin.choose([], pinned), /no longer lists the wallet/);
  assert.throws(() => WalletPin.choose([link('CMINE', { status: 'inactive' })], pinned), /no longer lists/);
});

test('a pin is kept per user and survives a reload', async () => {
  const storage = memoryStorage();
  await new WalletPin(storage, 'user-1').write(pinned);
  assert.deepEqual(await new WalletPin(storage, 'user-1').read(), pinned);
  assert.equal(await new WalletPin(storage, 'user-2').read(), null);
});

test('an unreadable pin reads as none', async () => {
  const storage = memoryStorage();
  const pin = new WalletPin(storage, 'user-1');
  storage.values.set(pin.key, '{bad');
  assert.equal(await pin.read(), null);
  storage.values.set(pin.key, JSON.stringify({ address: 1 }));
  assert.equal(await pin.read(), null);
});

test('a user id that could escape the storage key is refused', () => {
  assert.throws(() => new WalletPin(memoryStorage(), '../x'), /Unexpected user id/);
});
