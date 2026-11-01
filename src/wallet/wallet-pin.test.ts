import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TokenStorage } from '../session/install-scoped-token.ts';
import { base64 } from './base64.ts';
import type { PasskeyAssertion } from './passkey-assertion.ts';
import { passkeyHolder } from './passkey-holder.fixture.ts';
import { WalletPin } from './wallet-pin.ts';

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

function pinFor(storage: TokenStorage, userId: string, currentUserId = userId): WalletPin {
  return new WalletPin(storage, userId, async () => currentUserId);
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

function setupPasskeys() {
  let creations = 0;
  const holders: ReturnType<typeof passkeyHolder>[] = [];
  const create = async () => {
    creations += 1;
    const holder = passkeyHolder();
    holders.push(holder);
    return { credentialId: `cred-${creations}`, publicKey: holder.publicKey };
  };
  return { create, holders, creations: () => creations };
}

const cancelled = async (): Promise<PasskeyAssertion> => {
  throw new Error('The confirmation was cancelled');
};

const refuseAddDevice = async () => {
  throw new Error('adding a device was not expected');
};

test('without a pin the first active sponsored Stellar wallet is the candidate', () => {
  const links = [link('CA', { sponsored: false }), link('CB', { status: 'inactive' }), link('CC')];
  assert.equal(WalletPin.choose(links, null)?.address, 'CC');
  assert.equal(WalletPin.choose([], null), null);
});

test('with a pin the pinned wallet is chosen even when CTX lists another first', () => {
  assert.equal(WalletPin.choose([link('COTHER'), link('CMINE')], pinned)?.address, 'CMINE');
});

test('with a pin the list is the authority when it swaps or hides the pinned wallet', () => {
  assert.equal(WalletPin.choose([link('COTHER')], pinned)?.address, 'COTHER');
  assert.equal(WalletPin.choose([], pinned), null);
  assert.equal(WalletPin.choose([link('CMINE', { status: 'inactive' })], pinned), null);
});

test('a pin counts only for the wallet and passkey it was written for', () => {
  const key = passkeyHolder().publicKey;
  const mine = { address: 'CMINE', passkeyPublicKey: base64.encode(key) };
  assert.deepEqual(WalletPin.current(mine, 'CMINE', key), mine);
  assert.equal(WalletPin.current(mine, 'COTHER', key), null);
  assert.equal(WalletPin.current(mine, 'CMINE', passkeyHolder().publicKey), null);
  assert.equal(WalletPin.current(null, 'CMINE', key), null);
});

test('a pin is kept per user and survives a reload', async () => {
  const storage = memoryStorage();
  await pinFor(storage, 'user-1').write(pinned);
  assert.deepEqual(await pinFor(storage, 'user-1').read(), pinned);
  assert.equal(await pinFor(storage, 'user-2').read(), null);
});

const unreadable = ['{bad', 'null', '7', '[]', JSON.stringify({ address: 1 }), JSON.stringify({ address: 'CMINE' })];

test('an unreadable pin is discarded and read as no pin', async () => {
  const storage = memoryStorage();
  const pin = pinFor(storage, 'user-1');
  for (const stored of unreadable) {
    storage.values.set(pin.key, stored);
    assert.equal(await pin.read(), null);
    assert.equal(storage.values.has(pin.key), false);
  }
});

test('an unreadable setup passkey is discarded and read as none', async () => {
  const storage = memoryStorage();
  const pin = pinFor(storage, 'user-1');
  for (const stored of [...unreadable, JSON.stringify({ credentialId: 'cred-1' })]) {
    storage.values.set(pin.pendingKey, stored);
    assert.equal(await pin.pendingPasskey(), null);
    assert.equal(storage.values.has(pin.pendingKey), false);
  }
});

test('a wallet with an unreadable pin is pinned again only after the passkey confirms it', async () => {
  const storage = memoryStorage();
  const pin = pinFor(storage, 'user-1');
  const holder = passkeyHolder();
  storage.values.set(pin.key, '{bad');
  const discarded = await pin.read();
  const linked = { thisDevice: 'linked' as const, passkeyPublicKey: holder.publicKey };
  assert.equal(await pin.admits(discarded, 'CMINE', linked), false);
  await pin.confirmThisDevice(discarded, 'CMINE', linked, refuseAddDevice, holder.sign);
  assert.equal((await pin.read())?.address, 'CMINE');
});

test('the storage keys hold the user id base64url-encoded', () => {
  const pin = pinFor(memoryStorage(), 'user-1');
  assert.equal(pin.key, 'wallet.pin.dXNlci0x');
  assert.equal(pin.pendingKey, 'wallet.pending.dXNlci0x');
  assert.match(pinFor(memoryStorage(), '../x?/é').key, /^wallet\.pin\.[A-Za-z0-9_-]+$/);
});

test('a wallet is pinned on first use only after the passkey the wallet holds confirms it', async () => {
  const storage = memoryStorage();
  const pin = pinFor(storage, 'user-1');
  const holder = passkeyHolder();
  await pin.pinConfirmed('CMINE', holder.publicKey, holder.sign);
  assert.deepEqual(await pin.read(), { address: 'CMINE', passkeyPublicKey: base64.encode(holder.publicKey) });
});

test('a wallet whose passkey is not the user’s is never pinned', async () => {
  const storage = memoryStorage();
  const pin = pinFor(storage, 'user-1');
  const user = passkeyHolder();
  const attacker = passkeyHolder();
  await assert.rejects(pin.pinConfirmed('CEVIL', attacker.publicKey, user.sign), /wasn't the sign-in/);
  assert.equal(await pin.read(), null);
});

test('a setup retry reuses the passkey made by the first attempt once it still signs', async () => {
  const storage = memoryStorage();
  const pin = pinFor(storage, 'user-1');
  const passkeys = setupPasskeys();
  const created = await pin.passkeyForSetup(passkeys.create, cancelled);
  const retried = await pinFor(storage, 'user-1').passkeyForSetup(passkeys.create, passkeys.holders[0].sign);
  assert.deepEqual(retried, created);
  assert.equal(passkeys.creations(), 1);
});

test('a setup retry whose saved passkey no longer signs makes a new passkey', async () => {
  for (const sign of [cancelled, passkeyHolder().sign]) {
    const storage = memoryStorage();
    const pin = pinFor(storage, 'user-1');
    const passkeys = setupPasskeys();
    const first = await pin.passkeyForSetup(passkeys.create, cancelled);
    const retried = await pin.passkeyForSetup(passkeys.create, sign);
    assert.equal(passkeys.creations(), 2);
    assert.notEqual(retried.credentialId, first.credentialId);
    assert.equal((await pin.pendingPasskey())?.credentialId, retried.credentialId);
  }
});

test('writing the pin clears the passkey kept for setup', async () => {
  const storage = memoryStorage();
  const pin = pinFor(storage, 'user-1');
  await pin.passkeyForSetup(setupPasskeys().create, cancelled);
  await pin.write(pinned);
  assert.equal(await pin.pendingPasskey(), null);
});

test('a wallet holding the passkey made here is pinned without asking again', async () => {
  const storage = memoryStorage();
  const pin = pinFor(storage, 'user-1');
  const created = await pin.passkeyForSetup(setupPasskeys().create, cancelled);
  assert.equal(await pin.pinCreatedHere('CMINE', passkeyHolder().publicKey), false);
  assert.equal(await pin.read(), null);
  assert.equal(await pin.pinCreatedHere('CMINE', created.publicKey), true);
  assert.equal((await pin.read())?.address, 'CMINE');
});

test('with no passkey made here nothing is pinned without asking', async () => {
  const pin = pinFor(memoryStorage(), 'user-1');
  assert.equal(await pin.pinCreatedHere('CMINE', passkeyHolder().publicKey), false);
  assert.equal(await pin.read(), null);
});

test('a pin or setup passkey is not saved once another account is signed in', async () => {
  const storage = memoryStorage();
  const pin = pinFor(storage, 'user-1', 'user-2');
  await assert.rejects(pin.write(pinned), /switched accounts/);
  await assert.rejects(pin.requireCurrentUser(), /switched accounts/);
  await assert.rejects(pin.passkeyForSetup(setupPasskeys().create, cancelled), /switched accounts/);
  assert.equal(storage.values.size, 0);
});

test('a wallet is admitted on load only when this device is linked and the wallet is pinned or made here', async () => {
  const storage = memoryStorage();
  const pin = pinFor(storage, 'user-1');
  const holder = passkeyHolder();
  const linked = { thisDevice: 'linked' as const, passkeyPublicKey: holder.publicKey };
  const unlinked = { thisDevice: 'unlinked' as const, passkeyPublicKey: holder.publicKey };
  assert.equal(await pin.admits(pinned, 'CMINE', unlinked), false);
  assert.equal(await pin.admits(null, 'CMINE', unlinked), false);
  assert.equal(await pin.admits(null, 'CMINE', linked), false);
  assert.equal(await pin.read(), null);
  assert.equal(await pin.admits(pinned, 'CMINE', linked), true);
});

test('a wallet made here is admitted on load and pinned', async () => {
  const storage = memoryStorage();
  const pin = pinFor(storage, 'user-1');
  const created = await pin.passkeyForSetup(setupPasskeys().create, cancelled);
  const linked = { thisDevice: 'linked' as const, passkeyPublicKey: created.publicKey };
  assert.equal(await pin.admits(null, 'CMINE', linked), true);
  assert.equal((await pin.read())?.address, 'CMINE');
});

test('an unlinked device is added to the wallet before it is pinned', async () => {
  const storage = memoryStorage();
  const pin = pinFor(storage, 'user-1');
  const holder = passkeyHolder();
  const steps: string[] = [];
  const addDevice = async () => {
    steps.push(`added, pinned ${(await pin.read()) !== null}`);
  };
  const unlinked = { thisDevice: 'unlinked' as const, passkeyPublicKey: holder.publicKey };
  await pin.confirmThisDevice(null, 'CMINE', unlinked, addDevice, cancelled);
  assert.deepEqual(steps, ['added, pinned false']);
  assert.deepEqual(await pin.read(), { address: 'CMINE', passkeyPublicKey: base64.encode(holder.publicKey) });
});

test('a failed device add leaves the wallet unpinned', async () => {
  const pin = pinFor(memoryStorage(), 'user-1');
  const unlinked = { thisDevice: 'unlinked' as const, passkeyPublicKey: passkeyHolder().publicKey };
  await assert.rejects(pin.confirmThisDevice(null, 'CMINE', unlinked, refuseAddDevice, cancelled), /not expected/);
  assert.equal(await pin.read(), null);
});

test('a linked device with no pin pins the wallet only after its passkey confirms it', async () => {
  const storage = memoryStorage();
  const pin = pinFor(storage, 'user-1');
  const user = passkeyHolder();
  const attacker = passkeyHolder();
  const linked = { thisDevice: 'linked' as const, passkeyPublicKey: attacker.publicKey };
  await assert.rejects(
    pin.confirmThisDevice(null, 'CEVIL', linked, refuseAddDevice, user.sign),
    /wasn't the sign-in/,
  );
  assert.equal(await pin.read(), null);
  await pin.confirmThisDevice(null, 'CEVIL', linked, refuseAddDevice, attacker.sign);
  assert.equal((await pin.read())?.address, 'CEVIL');
});

test('a linked and pinned device is not asked to confirm again', async () => {
  const storage = memoryStorage();
  const pin = pinFor(storage, 'user-1');
  await pin.write(pinned);
  const linked = { thisDevice: 'linked' as const, passkeyPublicKey: passkeyHolder().publicKey };
  await pin.confirmThisDevice(pinned, 'CMINE', linked, refuseAddDevice, cancelled);
  assert.deepEqual(await pin.read(), pinned);
});
