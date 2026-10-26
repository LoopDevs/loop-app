import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PasskeyPublicKey } from './passkey-public-key.ts';

const x = new Uint8Array(32).fill(1);
const y = new Uint8Array(32).fill(2);
const point = Uint8Array.of(0x04, ...x, ...y);
const spkiHeader = Uint8Array.from(
  '3059301306072a8648ce3d020106082a8648ce3d030107034200'.match(/../g)!.map((hex) => parseInt(hex, 16)),
);

test('raw x and y coordinates become an uncompressed point', () => {
  assert.deepEqual(PasskeyPublicKey.uncompressedPoint(Uint8Array.of(...x, ...y)), point);
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
