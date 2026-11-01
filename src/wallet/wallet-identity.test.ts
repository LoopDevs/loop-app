import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bytesToHex, randomBytes } from '@noble/hashes/utils';

import { PasskeyAssertion } from './passkey-assertion.ts';
import { passkeyHolder, type PasskeyHolder } from './passkey-holder.fixture.ts';
import { WalletIdentity } from './wallet-identity.ts';

const wallet = 'CMINE';
const challenge = randomBytes(32);

function identityFor(holder: PasskeyHolder, derived: string, sign = holder.sign) {
  const lookups: string[] = [];
  const identity = new WalletIdentity(wallet, {
    signWithPasskey: sign,
    async addressOf(credentialId) {
      lookups.push(bytesToHex(credentialId));
      return bytesToHex(credentialId) === bytesToHex(holder.credentialId) ? derived : 'CUNKNOWN';
    },
  });
  return { identity, lookups };
}

test('a confirmation by the wallet passkey whose sign-in makes this wallet is accepted', async () => {
  const holder = passkeyHolder();
  const { identity, lookups } = identityFor(holder, wallet);
  const assertion = await identity.prove(challenge, holder.publicKey);
  assert.deepEqual(assertion.credentialId, holder.credentialId);
  assert.deepEqual(lookups, [bytesToHex(holder.credentialId)]);
});

test('a sign-in that makes another wallet is refused', async () => {
  const holder = passkeyHolder();
  const { identity } = identityFor(holder, 'COTHER');
  await assert.rejects(identity.prove(challenge, holder.publicKey), /couldn't confirm this wallet is yours/);
});

test('a confirmation that reports no credential is refused without a lookup', async () => {
  const holder = passkeyHolder();
  const withoutCredential = async (digest: Uint8Array) =>
    PasskeyAssertion.fromResponse((await holder.respond(digest)).response);
  const { identity, lookups } = identityFor(holder, wallet, withoutCredential);
  await assert.rejects(identity.prove(challenge, holder.publicKey), /couldn't confirm this wallet is yours/);
  assert.deepEqual(lookups, []);
});

test('a confirmation by another passkey is refused before any lookup', async () => {
  const holder = passkeyHolder();
  const { identity, lookups } = identityFor(holder, wallet, passkeyHolder().sign);
  await assert.rejects(identity.prove(challenge, holder.publicKey), /sign-in you set Loop up with/);
  assert.deepEqual(lookups, []);
});
