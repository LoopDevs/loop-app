import assert from 'node:assert/strict';
import { test } from 'node:test';

import { p256 } from '@noble/curves/nist';

import { PasskeyPublicKey } from './passkey-public-key.ts';

const point = p256.getPublicKey(p256.utils.randomPrivateKey(), false);
const coordinates = point.slice(1);
const offCurve = Uint8Array.of(0x04, ...new Uint8Array(32).fill(1), ...new Uint8Array(32).fill(2));
const spkiHeader = Uint8Array.from(
  '3059301306072a8648ce3d020106082a8648ce3d030107034200'.match(/../g)!.map((hex) => parseInt(hex, 16)),
);

test('raw x and y coordinates become an uncompressed point', () => {
  assert.deepEqual(PasskeyPublicKey.uncompressedPoint(coordinates), point);
});

test('coordinates or an SPKI key that are not a point on P-256 are refused', () => {
  assert.throws(() => PasskeyPublicKey.uncompressedPoint(offCurve.slice(1)), /not a P-256 key/);
  assert.throws(() => PasskeyPublicKey.uncompressedPoint(new Uint8Array(64)), /not a P-256 key/);
  assert.throws(
    () => PasskeyPublicKey.uncompressedPoint(Uint8Array.of(...spkiHeader, ...offCurve)),
    /not a P-256 key/,
  );
});

test('a P-256 SPKI key yields its uncompressed point', () => {
  assert.deepEqual(PasskeyPublicKey.uncompressedPoint(Uint8Array.of(...spkiHeader, ...point)), point);
});

test('a key with another header is refused even when its tail looks like a point', () => {
  const otherHeader = new Uint8Array(spkiHeader.length).fill(0x30);
  assert.throws(
    () => PasskeyPublicKey.uncompressedPoint(Uint8Array.of(...otherHeader, ...point)),
    /not a P-256 key/,
  );
  assert.throws(
    () => PasskeyPublicKey.uncompressedPoint(Uint8Array.of(0xa5, 0x01, ...point.slice(0, 73))),
    /not a P-256 key/,
  );
});

test('a raw uncompressed point or a short key is refused', () => {
  assert.throws(() => PasskeyPublicKey.uncompressedPoint(point), /not a P-256 key/);
  assert.throws(() => PasskeyPublicKey.uncompressedPoint(new Uint8Array(10)), /not a P-256 key/);
});
