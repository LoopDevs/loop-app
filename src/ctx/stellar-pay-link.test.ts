import assert from 'node:assert/strict';
import { test } from 'node:test';

import { StellarPayLink } from './stellar-pay-link.ts';

const account = `G${'A'.repeat(55)}`;
const muxed = `M${'A'.repeat(68)}`;

test('the pay link for the order currency gives the account and memo to pay', () => {
  const uri = `web+stellar:pay?destination=${account}&amount=12.5&memo=ctx%3Aabc&memo_type=MEMO_TEXT`;
  const link = StellarPayLink.of({
    paymentCryptoCurrency: 'XLM',
    paymentCryptoAddress: muxed,
    paymentUrls: { XLM: uri, 'XLM.USDC': 'web+stellar:pay?destination=other' },
  });
  assert.equal(link?.uri, uri);
  assert.equal(link?.destination, account);
  assert.equal(link?.memo, 'ctx:abc');
});

test('an order with no usable pay link falls back to its payment address with no memo', () => {
  for (const paymentUrls of [undefined, { XLM: 'https://evil.test/pay' }, { XLM: 'web+stellar:pay?destination=nope' }]) {
    const link = StellarPayLink.of({ paymentCryptoCurrency: 'XLM', paymentCryptoAddress: muxed, paymentUrls });
    assert.equal(link?.uri, null);
    assert.equal(link?.destination, muxed);
    assert.equal(link?.memo, null);
  }
});

test('an order with neither a pay link nor a Stellar address has nothing to pay to', () => {
  assert.equal(StellarPayLink.of({ paymentCryptoCurrency: 'XLM', paymentCryptoAddress: 'bc1qxyz' }), null);
  assert.equal(StellarPayLink.of({ paymentCryptoCurrency: 'XLM' }), null);
});
