import assert from 'node:assert/strict';
import { test } from 'node:test';

import { base64 } from './base64.ts';

const highBytes = Uint8Array.from([0xfb, 0xff, 0xfe, 0xfb, 0xef, 0xbf]);

test('url encoding uses only the base64url alphabet with no padding', () => {
  assert.equal(base64.encode(highBytes), '+//++++/');
  assert.equal(base64.encodeUrl(highBytes), '-__----_');
  assert.equal(base64.encodeUrl(new Uint8Array(16)), 'AAAAAAAAAAAAAAAAAAAAAA');
});

test('url encoding round-trips through decode', () => {
  const bytes = Uint8Array.from({ length: 32 }, (_, index) => (index * 37 + 251) % 256);
  assert.deepEqual(base64.decode(base64.encodeUrl(bytes)), bytes);
});
