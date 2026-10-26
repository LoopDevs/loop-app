import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PriceWindow } from './price-window.ts';

const expiration = '2026-10-26T12:10:00Z';
const expiresAt = Date.parse(expiration);

test('a crypto order has a price window ending at its payment URL expiration', () => {
  const window = PriceWindow.of({ paymentMethod: 'crypto', paymentUrlExpiration: expiration });
  assert.equal(window?.expiresAt, expiresAt);
});

test('a bank order or an order with no expiration has no price window', () => {
  assert.equal(PriceWindow.of({ paymentMethod: 'plaid-uk-eu', paymentUrlExpiration: expiration }), null);
  assert.equal(PriceWindow.of({ paymentMethod: 'crypto' }), null);
  assert.equal(PriceWindow.of({ paymentMethod: 'crypto', paymentUrlExpiration: 'soon' }), null);
});

test('the remaining time counts down in minutes and seconds', () => {
  const window = new PriceWindow(expiresAt);
  assert.equal(window.remaining(expiresAt - 600_000), '10:00');
  assert.equal(window.remaining(expiresAt - 65_500), '1:05');
  assert.equal(window.remaining(expiresAt + 5_000), '0:00');
});

test('the window closes 30 seconds before the expiration', () => {
  const window = new PriceWindow(expiresAt);
  assert.equal(window.isClosed(expiresAt - 30_000), false);
  assert.equal(window.isClosed(expiresAt - 29_999), true);
  assert.equal(window.isClosed(expiresAt + 1), true);
});
