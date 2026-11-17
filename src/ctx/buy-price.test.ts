import assert from 'node:assert/strict';
import { test } from 'node:test';

import { units } from '../stellar/units.ts';
import { BuyPrice, type BuyQuote } from './buy-price.ts';
import { Rates } from './rates.ts';

const usdc = 'XLM.USDC';
const shown = units.parse('25.00');
const quote: BuyQuote = { shown, currency: usdc, usdPrice: Rates.one };

function order(amount: string, currency = usdc) {
  return { paymentCryptoAmount: amount, paymentCryptoCurrency: currency };
}

test('a dollar card is shown at its face value', () => {
  assert.equal(BuyPrice.shown('25', Rates.one), shown);
  assert.equal(BuyPrice.shown('37.50', Rates.one), units.parse('37.50'));
});

test('a card in another currency is shown in dollars rounded up to the cent', () => {
  assert.equal(BuyPrice.shown('20', units.parse('1.2731005')), units.parse('25.47'));
});

test('the shown price converts to the payment token, rounded up to its smallest unit', () => {
  assert.equal(BuyPrice.inTokens(units.parse('50.80'), units.parse('1.27')), units.parse('40'));
  assert.equal(BuyPrice.inTokens(units.parse('25'), units.parse('3')), units.parse('8.3333334'));
  assert.equal(BuyPrice.inTokens(shown, Rates.one), shown);
  assert.equal(BuyPrice.inTokens(shown, 0n), null);
});

test('a card with no exchange rate or no amount has no shown price', () => {
  assert.equal(BuyPrice.shown('20', null), null);
  assert.equal(BuyPrice.shown('', Rates.one), null);
  assert.equal(BuyPrice.shown('0', Rates.one), null);
});

test('an order priced at the shown amount is paid', () => {
  assert.deepEqual(BuyPrice.check(order('25.0000000'), quote), { kind: 'pay', price: shown });
});

test('an order up to one percent above the shown amount is paid', () => {
  assert.deepEqual(BuyPrice.check(order('25.25'), quote), { kind: 'pay', price: units.parse('25.25') });
});

test('an order more than one percent above the shown amount asks the user to confirm', () => {
  assert.deepEqual(BuyPrice.check(order('25.2500001'), quote), { kind: 'confirm', price: units.parse('25.26') });
  assert.deepEqual(BuyPrice.check(order('40'), quote), { kind: 'confirm', price: units.parse('40') });
});

test('an order with no shown amount asks the user to confirm', () => {
  assert.deepEqual(BuyPrice.check(order('25'), { ...quote, shown: null }), { kind: 'confirm', price: shown });
});

test('an order in a currency other than the requested one is refused', () => {
  assert.deepEqual(BuyPrice.check(order('25', 'XLM'), quote), { kind: 'refuse' });
  assert.deepEqual(BuyPrice.check(order('25', 'XLM.EURC'), quote), { kind: 'refuse' });
  assert.deepEqual(BuyPrice.check({ paymentCryptoAmount: '25' }, quote), { kind: 'refuse' });
});

test('an order with no payment amount is refused', () => {
  assert.deepEqual(BuyPrice.check({ paymentCryptoCurrency: usdc }, quote), { kind: 'refuse' });
  assert.deepEqual(BuyPrice.check(order('0'), quote), { kind: 'refuse' });
});

test('dollars show the price to the cent', () => {
  assert.equal(BuyPrice.dollars(units.parse('25.47')), '25.47');
});

test('a card price on a cent is shown as it is and a hair above or below rounds up to the cent', () => {
  assert.equal(BuyPrice.shown('0.01', Rates.one), units.parse('0.01'));
  assert.equal(BuyPrice.shown('0.0100001', Rates.one), units.parse('0.02'));
  assert.equal(BuyPrice.shown('0.0099999', Rates.one), units.parse('0.01'));
  assert.equal(BuyPrice.shown('1.0000001', Rates.one), units.parse('1.01'));
});

test('a card price below the smallest unit still rounds up to a unit before the cent', () => {
  const half = units.parse('0.5');
  assert.equal(BuyPrice.shown('0.0000001', half), units.parse('0.01'));
  assert.equal(BuyPrice.shown('0.0000002', half), units.parse('0.01'));
});

test('the token amount is exact when the price divides it and a unit higher when it does not', () => {
  assert.equal(BuyPrice.inTokens(units.parse('3'), units.parse('3')), units.parse('1'));
  assert.equal(BuyPrice.inTokens(1n, units.parse('3')), 1n);
  assert.equal(BuyPrice.inTokens(units.parse('1'), units.parse('0.5')), units.parse('2'));
  assert.equal(BuyPrice.inTokens(units.parse('1'), units.parse('3')), units.parse('0.3333334'));
  assert.equal(BuyPrice.inTokens(shown, -1n), null);
});

test('an order price is rounded up to the cent whether it is exact, a hair above or a hair below', () => {
  assert.deepEqual(BuyPrice.check(order('25.0000000'), quote), { kind: 'pay', price: units.parse('25.00') });
  assert.deepEqual(BuyPrice.check(order('25.0000001'), quote), { kind: 'pay', price: units.parse('25.01') });
  assert.deepEqual(BuyPrice.check(order('24.9999999'), quote), { kind: 'pay', price: units.parse('25.00') });
});

test('an order priced in another unit of account rounds up to the next smallest unit before the cent', () => {
  const half = { shown: units.parse('0.01'), currency: usdc, usdPrice: units.parse('0.5') };
  assert.deepEqual(BuyPrice.check(order('0.0000001'), half), {
    kind: 'pay',
    price: units.parse('0.01'),
  });
});
