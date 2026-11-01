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
  paymentMethod: 'plaid-uk-eu',
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

test('a merchant currency maps to the rail of one country, or to none', () => {
  assert.equal(BankPayment.rail('GBP')?.country, 'GB');
  assert.equal(BankPayment.rail('GBP')?.bankLabel, 'UK bank account');
  assert.equal(BankPayment.rail('CAD'), null);
  const currencies = BankPayment.rails.map((rail) => rail.currency);
  assert.equal(new Set(currencies).size, currencies.length);
});

test('only orders paid through the bank method are bank orders', () => {
  assert.equal(BankPayment.isBank(bankOrder()), true);
  assert.equal(BankPayment.isBank(bankOrder({ paymentMethod: 'plaid-vrp' })), true);
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

test('a link without a readable expiry stays open', () => {
  assert.equal(BankPayment.linkExpired(bankOrder({ paymentUrlExpiration: undefined }), now), false);
  assert.equal(BankPayment.link(bankOrder({ paymentUrlExpiration: 'soon' }), now), 'https://secure.plaid.com/hl/abc');
});

test('only an https link on a plaid host is offered for approval', () => {
  assert.equal(BankPayment.openLink(bankOrder({ paymentUrl: 'http://secure.plaid.com/hl/abc' })), null);
  assert.equal(BankPayment.openLink(bankOrder({ paymentUrl: 'https://secure.plaid.com.example/hl/abc' })), null);
  assert.equal(BankPayment.openLink(bankOrder({ paymentUrl: 'https://example.com/plaid.com' })), null);
  assert.equal(BankPayment.openLink(bankOrder({ paymentUrl: 'hl/abc' })), null);
  assert.equal(BankPayment.openLink(bankOrder({ paymentUrl: 'https://plaid.com/hl/abc' })), 'https://plaid.com/hl/abc');
});

test('a link that is present but not offered for approval counts as refused', () => {
  assert.equal(BankPayment.linkRefused(bankOrder({ paymentUrl: 'https://evil.test/hl/abc' })), true);
  assert.equal(BankPayment.linkRefused(bankOrder({ paymentUrl: 'http://secure.plaid.com/hl/abc' })), true);
  assert.equal(BankPayment.linkRefused(bankOrder()), false);
  assert.equal(BankPayment.linkRefused(bankOrder({ paymentUrl: undefined })), false);
  assert.equal(BankPayment.linkRefused(bankOrder({ status: 'paid', paymentStatus: 'paid', paymentUrl: 'https://evil.test/x' })), false);
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
    payment: { kind: 'bank', linkOpen: true },
    follow: true,
    sent: null,
  });
});

test('an unpaid order is followed until CTX settles it, whether or not its link is still open', () => {
  const linkClosed = bankOrder({ paymentUrlExpiration: earlier });
  assert.deepEqual(BankPayment.resumed(linkClosed, now), {
    order: linkClosed,
    payment: { kind: 'bank', linkOpen: false },
    follow: true,
    sent: null,
  });
  const noLink = bankOrder({ paymentMethod: 'plaid-vrp', paymentUrl: undefined, paymentUrlExpiration: undefined });
  assert.deepEqual(BankPayment.resumed(noLink, now), {
    order: noLink,
    payment: { kind: 'bank', linkOpen: false },
    follow: true,
    sent: null,
  });
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
  assert.match(BankPayment.refusalMessage('ErrBankLinkRequired') ?? '', /isn't linked/);
  assert.equal(BankPayment.refusalMessage('ErrServerError'), null);
  assert.equal(BankPayment.refusalMessage(undefined), null);
});
