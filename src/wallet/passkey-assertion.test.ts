import assert from 'node:assert/strict';
import { test } from 'node:test';

import { p256 } from '@noble/curves/nist';
import { sha256 } from '@noble/hashes/sha2';
import { concatBytes, randomBytes } from '@noble/hashes/utils';

import { base64 } from './base64.ts';
import { PasskeyAssertion } from './passkey-assertion.ts';

const order = p256.Point.Fn.ORDER;
const half = order >> 1n;
const secret = p256.utils.randomPrivateKey();
const publicKey = p256.getPublicKey(secret, false);
const digest = randomBytes(32);

function scalar(bytes: Uint8Array): bigint {
  return BigInt(`0x${Buffer.from(bytes).toString('hex')}`);
}

function assertion(challenge: Uint8Array, highS: boolean, type = 'webauthn.get') {
  const authenticatorData = randomBytes(37);
  const clientDataJson = new TextEncoder().encode(
    JSON.stringify({ type, challenge: base64.encodeUrl(challenge), origin: 'https://loopfinance.io' }),
  );
  const message = concatBytes(authenticatorData, sha256(clientDataJson));
  const signed = p256.sign(message, secret, { lowS: true });
  const signature = highS ? new p256.Signature(signed.r, order - signed.s) : signed;
  return PasskeyAssertion.fromResponse({
    authenticatorData: base64.encodeUrl(authenticatorData),
    clientDataJSON: base64.encodeUrl(clientDataJson),
    signature: base64.encodeUrl(signature.toBytes('der')),
  });
}

test('a DER signature converts to 64 raw bytes', () => {
  const signed = p256.sign(digest, secret, { lowS: true });
  const raw = PasskeyAssertion.rawLowS(signed.toBytes('der'));
  assert.equal(raw.length, 64);
  assert.equal(scalar(raw.slice(0, 32)), signed.r);
  assert.equal(scalar(raw.slice(32)), signed.s);
});

test('a high-S DER signature converts to its low-S form', () => {
  const signed = p256.sign(digest, secret, { lowS: true });
  const high = new p256.Signature(signed.r, order - signed.s);
  assert.ok(high.s > half);
  const raw = PasskeyAssertion.rawLowS(high.toBytes('der'));
  assert.equal(scalar(raw.slice(0, 32)), signed.r);
  assert.equal(scalar(raw.slice(32)), signed.s);
  assert.ok(scalar(raw.slice(32)) <= half);
});

test('short DER integers are left-padded to 32 bytes', () => {
  const raw = PasskeyAssertion.rawLowS(new p256.Signature(5n, 9n).toBytes('der'));
  assert.equal(raw.length, 64);
  assert.equal(scalar(raw.slice(0, 32)), 5n);
  assert.equal(scalar(raw.slice(32)), 9n);
});

test('a signature over the challenge by the wallet passkey is accepted, high-S or not', () => {
  assert.doesNotThrow(() => assertion(digest, false).requireSigned(digest, publicKey));
  assert.doesNotThrow(() => assertion(digest, true).requireSigned(digest, publicKey));
});

test('a signature over another challenge is refused', () => {
  assert.throws(() => assertion(randomBytes(32), false).requireSigned(digest, publicKey), /something else/);
  assert.throws(() => assertion(digest, false, 'webauthn.create').requireSigned(digest, publicKey), /something else/);
});

test('a signature by another passkey is refused', () => {
  const otherKey = p256.getPublicKey(p256.utils.randomPrivateKey(), false);
  assert.throws(() => assertion(digest, false).requireSigned(digest, otherKey), /sign-in you set Loop up with/);
});

test('the payload holds the raw signature and the uncompressed public key', () => {
  const json = assertion(digest, true).toJson(publicKey);
  assert.equal(base64.decode(json.publicKey).length, 65);
  assert.equal(base64.decode(json.signature).length, 64);
  assert.ok(scalar(base64.decode(json.signature).slice(32)) <= half);
});
