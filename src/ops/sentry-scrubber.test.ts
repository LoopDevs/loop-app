import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Breadcrumb, ErrorEvent } from '@sentry/react-native';

import { SentryScrubber } from './sentry-scrubber.ts';

const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const refreshToken = 'rt_9f8e7d6c5b4a39281706f5e4d3c2b1a0';
const secretSeed = 'SBCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWX';
const signedXdr = 'AAAAAgAAAADZ'.repeat(12);
const email = 'person@example.com';
const redeemUrl = 'https://redeem.example.com/r/abc123secret';

function dump(value: unknown): string {
  return JSON.stringify(value);
}

function eventWith(fields: Partial<ErrorEvent>): ErrorEvent {
  return { type: undefined, ...fields } as ErrorEvent;
}

test('a CTX error body is cut down to its status', () => {
  const scrubbed = SentryScrubber.scrubEvent(
    eventWith({
      exception: { values: [{ type: 'Error', value: 'CTX 500: {"email":"a@b.c","pin":"1234"}' }] },
    }),
  );
  assert.equal(scrubbed.exception?.values?.[0]?.value, 'CTX 500');
});

test('a CTX error body inside a wrapped message is cut down to its status', () => {
  const scrubbed = SentryScrubber.scrubString('Failed to pay: CTX 400: {"cardNumber":"4111111111111111"}');
  assert.equal(scrubbed, 'Failed to pay: CTX 400');
});

test('camelCase sensitive keys are redacted', () => {
  const scrubbed = SentryScrubber.scrubString('{"cardNumber":"4111111111111111","apiToken":"abc123"}');
  assert.ok(!scrubbed.includes('4111'));
  assert.ok(!scrubbed.includes('abc123'));
});

test('free text loses every sensitive class', () => {
  const text = [
    `jwt ${jwt}`,
    `Authorization: Bearer ${refreshToken}`,
    `mail ${email}`,
    `seed ${secretSeed}`,
    `xdr ${signedXdr}`,
    `open ${redeemUrl}`,
    'pin: 4821',
    '"number":"6035 1234 5678 9012"',
    'refreshToken=abc',
    '"idToken":"def"',
    'identityToken=ghi',
  ].join(' | ');
  const scrubbed = SentryScrubber.scrubString(text);
  const leaks = [jwt, refreshToken, email, secretSeed, signedXdr, redeemUrl, '4821', '6035', 'abc', 'def', 'ghi'];
  for (const leaked of leaks) {
    assert.ok(!scrubbed.includes(leaked), `leaked ${leaked}`);
  }
});

test('plain words and status codes survive', () => {
  assert.equal(SentryScrubber.scrubString('status_code=500 network failed'), 'status_code=500 network failed');
});

test('breadcrumbs keep method, status and a route template only', () => {
  const breadcrumb: Breadcrumb = {
    category: 'fetch',
    message: `GET ${redeemUrl}`,
    data: {
      method: 'GET',
      status_code: 200,
      url: 'https://staging.spend.ctx.com/users/8f14e45f-ceea-467a-9575-1c2b3d4e5f60/gift-cards/ord_123?x=1',
      request_body: '{"pin":"1234"}',
      response_body: `{"redeemUrl":"${redeemUrl}","number":"999"}`,
      headers: { Authorization: `Bearer ${jwt}` },
    },
  };
  const scrubbed = SentryScrubber.scrubBreadcrumb(breadcrumb);
  assert.deepEqual(scrubbed.data, {
    method: 'GET',
    status_code: 200,
    url: '/users/:id/gift-cards/:id',
  });
  assert.ok(!dump(scrubbed).includes('redeem'));
});

test('route templates drop query strings and unknown segments', () => {
  assert.equal(SentryScrubber.routeTemplate('/users/abc/gift-cards/xyz?x=1'), '/users/:id/gift-cards/:id');
  assert.equal(SentryScrubber.routeTemplate('https://h.example.com/me#frag'), '/me');
  assert.equal(SentryScrubber.routeTemplate('/login/oauth'), '/login/oauth');
});

test('events lose user, request data, headers and unlisted extra keys', () => {
  const scrubbed = SentryScrubber.scrubEvent(
    eventWith({
      user: { id: 'u1', email, ip_address: '1.2.3.4' },
      server_name: 'phone',
      request: {
        method: 'POST',
        url: 'https://staging.spend.ctx.com/verify-email?code=123456',
        headers: { Authorization: `Bearer ${jwt}`, Cookie: 'a=b' },
        data: { email, code: '123456', pin: '1234' },
        cookies: { session: 'x' },
      },
      extra: {
        componentStack: 'at Screen',
        accessToken: jwt,
        giftCard: { pin: '1234', number: '999', redeemUrl },
        walletAddress: 'GABC',
      },
      contexts: {
        device: { model: 'Pixel', name: "Ash's phone" },
        wallet: { secret: secretSeed },
      },
      tags: { release: '1.0.0', note: email },
      message: `failed for ${email}`,
    }),
  );
  assert.equal(scrubbed.user, undefined);
  assert.equal(scrubbed.server_name, undefined);
  assert.deepEqual(scrubbed.request, { method: 'POST', url: '/verify-email' });
  assert.deepEqual(Object.keys(scrubbed.extra ?? {}), ['componentStack']);
  assert.deepEqual(Object.keys(scrubbed.contexts ?? {}), ['device']);
  assert.deepEqual(scrubbed.contexts?.device, { model: 'Pixel' });
  const everything = dump(scrubbed);
  for (const leaked of [email, jwt, secretSeed, redeemUrl, '123456', '1.2.3.4', 'GABC', "Ash's phone"]) {
    assert.ok(!everything.includes(leaked), `leaked ${leaked}`);
  }
});

test('event breadcrumbs are scrubbed too', () => {
  const scrubbed = SentryScrubber.scrubEvent(
    eventWith({
      breadcrumbs: [{ category: 'console', message: `signed ${signedXdr} for ${email}`, data: { arguments: [jwt] } }],
    }),
  );
  const everything = dump(scrubbed.breadcrumbs);
  assert.ok(!everything.includes(signedXdr));
  assert.ok(!everything.includes(email));
  assert.ok(!everything.includes(jwt));
});
