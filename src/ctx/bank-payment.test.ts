import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BankPayment } from './bank-payment.ts';
import type { GiftCard } from './client.ts';

const now = Date.parse('2026-10-27T12:00:00Z');
const later = '2026-10-27T12:30:00Z';
const earlier = '2026-10-27T11:30:00Z';

const bankOrder = (fields: Partial<GiftCard> = {}): GiftCard => ({
  id: 'g1',
  status: 'unpaid',
  merchantId: 'm1',
  merchantName: 'Merchant',
  created: '2026-10-27T11:59:00Z',
  cardFiatAmount: '25.00',
  cardFiatCurrency: 'GBP',
  paymentId: 'p1',
  paymentStatus: 'unpaid',
  paymentMethod: BankPayment.method,
  paymentUrl: 'https://secure.plaid.com/hl/abc',
  paymentUrlExpiration: later,
  ...fields,
});

test('bank payment is offered for pound merchants to users whose cashback is in pounds', () => {
  assert.equal(BankPayment.offered('GBP', { stableCurrency: 'XLM.GBPLOOP' }), true);
  assert.equal(BankPayment.offered('GBP', { stableCurrency: 'XLM.USDC' }), false);
  assert.equal(BankPayment.offered('GBP', {}), false);
  assert.equal(BankPayment.offered('USD', { stableCurrency: 'XLM.GBPLOOP' }), false);
});

test('pound merchants accept bank payment whatever the user has set up', () => {
  assert.equal(BankPayment.accepts('GBP'), true);
  assert.equal(BankPayment.accepts('EUR'), false);
});

test('only orders paid through the bank method are bank orders', () => {
  assert.equal(BankPayment.isBank(bankOrder()), true);
  assert.equal(BankPayment.isBank(bankOrder({ paymentMethod: 'crypto' })), false);
});

test('a bank order is charged once CTX marks the payment paid', () => {
  assert.equal(BankPayment.charged(bankOrder()), false);
  assert.equal(BankPayment.charged(bankOrder({ paymentStatus: 'paid' })), true);
});

test('the approval link is open while the order is unpaid and the link is live', () => {
  assert.equal(BankPayment.link(bankOrder(), now), 'https://secure.plaid.com/hl/abc');
  assert.equal(BankPayment.linkExpired(bankOrder(), now), false);
});

test('the approval link closes when it expires', () => {
  const expired = bankOrder({ paymentUrlExpiration: earlier });
  assert.equal(BankPayment.link(expired, now), null);
  assert.equal(BankPayment.linkExpired(expired, now), true);
});

test('the open link ignores time and only needs an unpaid bank order with a link', () => {
  assert.equal(BankPayment.openLink(bankOrder({ paymentUrlExpiration: earlier })), 'https://secure.plaid.com/hl/abc');
  assert.equal(BankPayment.openLink(bankOrder({ paymentUrl: undefined })), null);
  assert.equal(BankPayment.openLink(bankOrder({ status: 'paid', paymentStatus: 'paid' })), null);
  assert.equal(BankPayment.openLink(bankOrder({ paymentMethod: 'crypto' })), null);
});

test('a link without a readable expiry counts as expired', () => {
  assert.equal(BankPayment.linkExpired(bankOrder({ paymentUrlExpiration: undefined }), now), true);
  assert.equal(BankPayment.link(bankOrder({ paymentUrlExpiration: 'soon' }), now), null);
});

test('a paid or settled order has no link and is never expired', () => {
  for (const status of ['paid', 'fulfilled', 'expired', 'rejected'] as const) {
    const order = bankOrder({ status, paymentUrlExpiration: earlier });
    assert.equal(BankPayment.link(order, now), null);
    assert.equal(BankPayment.linkExpired(order, now), false);
  }
});

test('a crypto order never offers a bank link', () => {
  assert.equal(BankPayment.link(bankOrder({ paymentMethod: 'crypto' }), now), null);
});

test('an unpaid order with a live link resumes waiting for the bank', () => {
  assert.deepEqual(BankPayment.resumed(bankOrder(), now), {
    order: bankOrder(),
    payment: { kind: 'bank' },
    follow: true,
    sent: null,
  });
});

test('an unpaid order with an expired link is dropped', () => {
  assert.equal(BankPayment.resumed(bankOrder({ paymentUrlExpiration: earlier }), now), null);
});

test('a paid order resumes and is followed, a settled one is shown still', () => {
  const paid = bankOrder({ status: 'paid', paymentStatus: 'paid' });
  assert.deepEqual(BankPayment.resumed(paid, now), { order: paid, payment: { kind: 'ready' }, follow: true, sent: null });
  const ready = bankOrder({ status: 'fulfilled', paymentStatus: 'paid' });
  assert.deepEqual(BankPayment.resumed(ready, now), {
    order: ready,
    payment: { kind: 'ready' },
    follow: false,
    sent: null,
  });
});

test('refusals that the user can act on get a plain message', () => {
  assert.match(BankPayment.refusalMessage('ErrBankPaymentIdentityRequired') ?? '', /name on your bank account/);
  assert.match(BankPayment.refusalMessage('ErrCashbackStableMismatch') ?? '', /cashback in pounds/);
  assert.match(BankPayment.refusalMessage('ErrCashbackNotStable') ?? '', /cashback in pounds/);
  assert.match(BankPayment.refusalMessage('ErrCurrencyInvalid') ?? '', /aren't available/);
  assert.equal(BankPayment.refusalMessage('ErrServerError'), null);
  assert.equal(BankPayment.refusalMessage(undefined), null);
});
