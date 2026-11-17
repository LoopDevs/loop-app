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
  const signed = p256.sign(message, secret, { lowS: true, prehash: true });
  const signature = highS ? new p256.Signature(signed.r, order - signed.s) : signed;
  return PasskeyAssertion.fromResponse({
    authenticatorData: base64.encodeUrl(authenticatorData),
    clientDataJSON: base64.encodeUrl(clientDataJson),
    signature: base64.encodeUrl(signature.toBytes('der')),
  });
}

test('the challenge is the digest in unpadded base64url', () => {
  const knownDigest = Uint8Array.from({ length: 32 }, (_, index) => index * 7 + 3);
  const challenge = PasskeyAssertion.challengeOf(knownDigest);
  assert.equal(challenge, 'AwoRGB8mLTQ7QklQV15lbHN6gYiPlp2kq7K5wMfO1dw');
  assert.equal(challenge.length, 43);
});

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

test('an ES256 assertion signed the way authenticators sign it is accepted', async () => {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const authenticatorPublicKey = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));
  const authenticatorData = randomBytes(37);
  const clientDataJson = new TextEncoder().encode(
    JSON.stringify({ type: 'webauthn.get', challenge: PasskeyAssertion.challengeOf(digest) }),
  );
  const raw = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      keys.privateKey,
      new Uint8Array(concatBytes(authenticatorData, sha256(clientDataJson))),
    ),
  );
  const signature = p256.Signature.fromBytes(raw, 'compact').toBytes('der');
  const signed = PasskeyAssertion.fromResponse({
    authenticatorData: base64.encodeUrl(authenticatorData),
    clientDataJSON: base64.encodeUrl(clientDataJson),
    signature: base64.encodeUrl(signature),
  });
  assert.doesNotThrow(() => signed.requireSigned(digest, authenticatorPublicKey));
});

test('a signature over another challenge is refused', () => {
  assert.throws(() => assertion(randomBytes(32), false).requireSigned(digest, publicKey), /something else/);
  assert.throws(() => assertion(digest, false, 'webauthn.create').requireSigned(digest, publicKey), /something else/);
});

test('a signature by another passkey is refused', () => {
  const otherKey = p256.getPublicKey(p256.utils.randomPrivateKey(), false);
  assert.throws(() => assertion(digest, false).requireSigned(digest, otherKey), /sign-in you set Loop up with/);
});

test('the credential id of the sign-in is kept when the platform reports one', () => {
  const credentialId = randomBytes(16);
  const { authenticatorData, clientDataJson, signature } = assertion(digest, false);
  const response = {
    authenticatorData: base64.encodeUrl(authenticatorData),
    clientDataJSON: base64.encodeUrl(clientDataJson),
    signature: base64.encodeUrl(new p256.Signature(scalar(signature.slice(0, 32)), scalar(signature.slice(32))).toBytes('der')),
  };
  assert.deepEqual(
    PasskeyAssertion.fromCredential({ id: base64.encodeUrl(credentialId), response }).credentialId,
    credentialId,
  );
  assert.equal(PasskeyAssertion.fromResponse(response).credentialId, null);
});

test('the payload holds the raw signature and the uncompressed public key', () => {
  const json = assertion(digest, true).toJson(publicKey);
  assert.equal(base64.decode(json.publicKey).length, 65);
  assert.equal(base64.decode(json.signature).length, 64);
  assert.ok(scalar(base64.decode(json.signature).slice(32)) <= half);
});

test('a fixed assertion encodes to a known payload with its high-S signature folded to low-S', () => {
  const highR = (1n << 255n) + 12345n;
  const highS = order - 777n;
  const authenticatorData = Uint8Array.from({ length: 37 }, (_, index) => index + 1);
  const clientDataJson = new TextEncoder().encode('{"type":"webauthn.get"}');
  const fixedPublicKey = Uint8Array.from({ length: 65 }, (_, index) => (index === 0 ? 4 : index));
  const json = PasskeyAssertion.fromResponse({
    authenticatorData: base64.encodeUrl(authenticatorData),
    clientDataJSON: base64.encodeUrl(clientDataJson),
    signature: base64.encodeUrl(new p256.Signature(highR, highS).toBytes('der')),
  }).toJson(fixedPublicKey);
  assert.deepEqual(json, {
    publicKey:
      'BAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0+P0A=',
    authenticatorData: 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyAhIiMkJQ==',
    clientDataJson: 'eyJ0eXBlIjoid2ViYXV0aG4uZ2V0In0=',
    signature:
      'gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMDkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADCQ==',
  });
});
