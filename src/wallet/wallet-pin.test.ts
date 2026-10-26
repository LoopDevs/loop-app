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
  assert.throws(() => WalletPin.choose([link('COTHER')], pinned), /doesn't list the wallet/);
  assert.throws(() => WalletPin.choose([], pinned), /doesn't list the wallet/);
  assert.throws(() => WalletPin.choose([link('CMINE', { status: 'inactive' })], pinned), /doesn't list/);
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

test('the storage key holds the user id base64url-encoded', () => {
  assert.equal(new WalletPin(memoryStorage(), 'user-1').key, 'wallet.pin.dXNlci0x');
  assert.match(new WalletPin(memoryStorage(), '../x?/é').key, /^wallet\.pin\.[A-Za-z0-9_-]+$/);
});
