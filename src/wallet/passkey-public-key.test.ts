import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PasskeyPublicKey } from './passkey-public-key.ts';

const x = new Uint8Array(32).fill(1);
const y = new Uint8Array(32).fill(2);
const point = Uint8Array.of(0x04, ...x, ...y);

test('raw x and y coordinates become an uncompressed point', () => {
  assert.deepEqual(PasskeyPublicKey.uncompressedPoint(Uint8Array.of(...x, ...y)), point);
});

test('an SPKI-encoded key yields its trailing uncompressed point', () => {
  const spkiHeader = new Uint8Array(26).fill(0x30);
  assert.deepEqual(PasskeyPublicKey.uncompressedPoint(Uint8Array.of(...spkiHeader, ...point)), point);
});

test('a key that is not an uncompressed P-256 point is refused', () => {
  assert.throws(() => PasskeyPublicKey.uncompressedPoint(new Uint8Array(70)), /not a P-256 key/);
  assert.throws(() => PasskeyPublicKey.uncompressedPoint(new Uint8Array(10)), /not a P-256 key/);
});
