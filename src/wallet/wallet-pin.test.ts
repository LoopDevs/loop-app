import assert from 'node:assert/strict';
import { test } from 'node:test';

import { p256 } from '@noble/curves/nist';
import { sha256 } from '@noble/hashes/sha2';
import { concatBytes, randomBytes } from '@noble/hashes/utils';

import type { TokenStorage } from '../session/install-scoped-token.ts';
import { base64 } from './base64.ts';
import { PasskeyAssertion } from './passkey-assertion.ts';
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

function passkeyHolder() {
  const secret = p256.utils.randomPrivateKey();
  const publicKey = p256.getPublicKey(secret, false);
  const sign = async (challenge: Uint8Array) => {
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
  };
  return { publicKey, sign };
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

test('without a pin the first active sponsored Stellar wallet is the candidate', () => {
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
  await pinFor(storage, 'user-1').write(pinned);
  assert.deepEqual(await pinFor(storage, 'user-1').read(), pinned);
  assert.equal(await pinFor(storage, 'user-2').read(), null);
});

test('an unreadable pin is refused', async () => {
  const storage = memoryStorage();
  const pin = pinFor(storage, 'user-1');
  for (const stored of ['{bad', 'null', '7', JSON.stringify({ address: 1 }), JSON.stringify({ address: 'CMINE' })]) {
    storage.values.set(pin.key, stored);
    await assert.rejects(pin.read(), /can't be read/);
  }
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

test('a setup retry reuses the passkey made by the first attempt', async () => {
  const storage = memoryStorage();
  const pin = pinFor(storage, 'user-1');
  const created = { credentialId: 'cred-1', publicKey: passkeyHolder().publicKey };
  let creations = 0;
  const create = async () => {
    creations += 1;
    return created;
  };
  assert.deepEqual(await pin.passkeyForSetup(create), created);
  assert.deepEqual(await pinFor(storage, 'user-1').passkeyForSetup(create), created);
  assert.equal(creations, 1);
});

test('writing the pin clears the passkey kept for setup', async () => {
  const storage = memoryStorage();
  const pin = pinFor(storage, 'user-1');
  const created = { credentialId: 'cred-1', publicKey: passkeyHolder().publicKey };
  await pin.passkeyForSetup(async () => created);
  await pin.write(pinned);
  assert.equal(await pin.pendingPasskey(), null);
});

test('a wallet holding the passkey made here is pinned without asking again', async () => {
  const storage = memoryStorage();
  const pin = pinFor(storage, 'user-1');
  const created = { credentialId: 'cred-1', publicKey: passkeyHolder().publicKey };
  await pin.passkeyForSetup(async () => created);
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
  const created = { credentialId: 'cred-1', publicKey: passkeyHolder().publicKey };
  await assert.rejects(pin.passkeyForSetup(async () => created), /switched accounts/);
  assert.equal(storage.values.size, 0);
});
