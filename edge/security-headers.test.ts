import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SecurityHeaders } from './security-headers.ts';

test('security headers are added to a response and keep its status, body and own headers', async () => {
  const response = new Response('body', { status: 415, headers: { 'content-type': 'text/plain' } });
  const secured = SecurityHeaders.applied(response, SecurityHeaders.baseline);
  assert.equal(secured.status, 415);
  assert.equal(secured.headers.get('content-type'), 'text/plain');
  assert.equal(secured.headers.get('x-frame-options'), 'DENY');
  assert.equal(secured.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(secured.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
  assert.equal(secured.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(secured.headers.get('content-security-policy'), "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  assert.equal(await secured.text(), 'body');
});

test('image headers show the file inline and keep the baseline', () => {
  const secured = SecurityHeaders.applied(new Response(null), SecurityHeaders.image);
  assert.equal(secured.headers.get('content-security-policy'), "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  assert.equal(secured.headers.get('content-disposition'), 'inline');
  assert.equal(secured.headers.get('x-frame-options'), 'DENY');
});
