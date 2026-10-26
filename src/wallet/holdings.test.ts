import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Payout, type PayoutJson } from '../ctx/payout.ts';
import { Rates } from '../ctx/rates.ts';
import type { PaymentCurrency } from '../stellar/network.ts';
import { units } from '../stellar/units.ts';
import { Holdings, type Holding } from './holdings.ts';

const walletAddress = 'CWALLET';

const currencies: PaymentCurrency[] =['XLM', 'XLM.USDC', 'XLM.EURC', 'XLM.GBPLOOP'];

const marketRates = Rates.fromPrices({
  XLM: '0.16870',
  'XLM.EURC': '1.12120',
  'XLM.GBPLOOP': '1.33670',
});

function holdings(
  wallet: Partial<Record<PaymentCurrency, string>>,
  options: { vaultValue?: string; onTheWay?: Holding[] | null; rates?: Rates } = {},
): Holdings {
  const tokens = currencies.map((currency) => ({
    token: { currency, symbol: currency, contract: '' },
    amount: units.parse(wallet[currency] ?? '0'),
  }));
  const vaultValue = units.parse(options.vaultValue ?? '0');
  return new Holdings(
    { tokens, vaultShares: vaultValue, vaultValue },
    options.onTheWay === undefined ? [] : options.onTheWay,
    options.rates ?? marketRates,
  );
}

function payout(overrides: Partial<PayoutJson>): Payout {
  return new Payout({
    id: 'p1',
    status: 'pending',
    currency: 'XLM.GBPLOOP',
    amount: '1',
    address: walletAddress,
    reservationTransferId: 't1',
    ...overrides,
  });
}

test('an amount in the stable counts at 1 with no rate for it', () => {
  const empty = holdings({}, { rates: Rates.fromPrices({}) });
  assert.equal(empty.valueIn(units.parse('4.25'), 'XLM.GBPLOOP', 'XLM.GBPLOOP'), units.parse('4.25'));
});

test('another currency crosses through USD and rounds down in 7 decimals', () => {
  assert.equal(holdings({}).valueIn(units.parse('10'), 'XLM.EURC', 'XLM.GBPLOOP'), units.parse('8.3878207'));
});

test('a missing rate for the currency or the stable makes the value unknown', () => {
  const partial = holdings({}, { rates: Rates.fromPrices({ 'XLM.EURC': '1.12120' }) });
  assert.equal(partial.valueIn(units.parse('1'), 'XLM', 'XLM.EURC'), null);
  assert.equal(partial.valueIn(units.parse('1'), 'XLM.EURC', 'XLM.GBPLOOP'), null);
  assert.equal(partial.valueIn(0n, 'XLM', 'XLM.GBPLOOP'), 0n);
});

test('USD and USDC are priced at 1 with no fetched rates', () => {
  const empty = holdings({}, { rates: Rates.fromPrices({}) });
  assert.equal(empty.valueIn(units.parse('3'), 'XLM.USDC', 'USD'), units.parse('3'));
  assert.equal(holdings({}).valueIn(units.parse('10'), 'XLM.EURC', 'USD'), units.parse('11.212'));
});

test('spendable USDC adds the savings withdrawal floor to the wallet balance', () => {
  const held = holdings({ 'XLM.USDC': '5', XLM: '20' }, { vaultValue: '10' });
  assert.equal(held.spendable('XLM.USDC'), units.parse('5') + Holdings.floorOf(units.parse('10')));
  assert.equal(held.spendable('XLM.USDC'), units.parse('14.9'));
  assert.equal(held.spendable('XLM'), units.parse('20'));
  assert.equal(held.spendable('XLM.EURC'), 0n);
});

test('on the way counts at 1 in the stable when the stable has no rate', () => {
  const held = holdings(
    { 'XLM.GBPLOOP': '2' },
    {
      rates: Rates.fromPrices({}),
      onTheWay: [
        { currency: 'XLM.GBPLOOP', amount: units.parse('3') },
        { currency: 'XLM.GBPLOOP', amount: units.parse('1.5') },
      ],
    },
  );
  assert.equal(held.onTheWayIn('XLM.GBPLOOP'), units.parse('4.5'));
  assert.equal(held.totalIn('XLM.GBPLOOP'), units.parse('6.5'));
});

test('spendable never includes what is on the way', () => {
  const onTheWay = [{ currency: 'XLM.USDC', amount: units.parse('7') }];
  const without = holdings({ 'XLM.USDC': '5' });
  const withCashback = holdings({ 'XLM.USDC': '5' }, { onTheWay });
  assert.equal(withCashback.spendable('XLM.USDC'), without.spendable('XLM.USDC'));
  assert.equal(withCashback.spendableIn('USD'), without.spendableIn('USD'));
  assert.equal(withCashback.totalIn('USD'), units.parse('12'));
});

test('the total is the sum of the shown spendable and on the way figures', () => {
  const held = holdings(
    { 'XLM.EURC': '0.004' },
    { onTheWay: [{ currency: 'XLM.EURC', amount: units.parse('0.009') }] },
  );
  const spendable = held.spendableIn('USD');
  const onTheWay = held.onTheWayIn('USD');
  assert.equal(spendable, 0n);
  assert.equal(onTheWay, units.parse('0.01'));
  assert.equal(held.totalIn('USD'), units.parse('0.01'));
});

test('a failed CTX read leaves spendable and hides on the way and the total', () => {
  const held = holdings({ 'XLM.USDC': '5' }, { onTheWay: null });
  assert.equal(held.spendableIn('USD'), units.parse('5'));
  assert.equal(held.onTheWayIn('USD'), null);
  assert.equal(held.totalIn('USD'), null);
});

test('a token with no rate hides the converted spendable figure', () => {
  const held = holdings({ XLM: '10', 'XLM.USDC': '1' }, { rates: Rates.fromPrices({}) });
  assert.equal(held.spendableIn('USD'), null);
  assert.equal(held.totalIn('USD'), null);
});

test('on the way lists ledger balances and in-flight payouts to this wallet only', () => {
  const onTheWay = Holdings.onTheWayFrom(
    {
      wallet: [
        { currency: 'XLM.GBPLOOP', amount: '2.50', estimates: { USD: '3.3' } },
        { currency: 'XLM.EURC', amount: '0' },
      ],
      payouts: [
        payout({ amount: '1.25' }),
        payout({ address: 'GELSEWHERE', amount: '9' }),
        payout({ address: undefined, amount: '9' }),
        payout({ status: 'complete', amount: '9' }),
        payout({ reservationTransferId: undefined, amount: '9' }),
        payout({ reversalTransferId: 'r1', amount: '9' }),
      ],
    },
    walletAddress,
  );
  assert.deepEqual(onTheWay, [
    { currency: 'XLM.GBPLOOP', amount: units.parse('2.5'), estimates: { USD: '3.3' } },
    { currency: 'XLM.GBPLOOP', amount: units.parse('1.25'), estimates: undefined },
  ]);
});

test('a payout counts what CTX sends after the network fee', () => {
  const account = { wallet: [], payouts: [payout({ currency: 'XLM.USDC', amount: '4', sentAmount: '3.99' })] };
  const held = holdings({}, { onTheWay: Holdings.onTheWayFrom(account, walletAddress) });
  assert.equal(held.onTheWayIn('USD'), units.parse('3.99'));
});

test('a payout to another address adds nothing to the total', () => {
  const account = { wallet: [], payouts: [payout({ address: 'GELSEWHERE', currency: 'XLM.USDC', amount: '4' })] };
  const held = holdings({ 'XLM.USDC': '4' }, { onTheWay: Holdings.onTheWayFrom(account, walletAddress) });
  assert.equal(held.totalIn('USD'), units.parse('4'));
});

test('a ledger balance that does not parse is skipped and the rest still count', () => {
  const account = {
    wallet: [
      { currency: 'XLM.USDC', amount: '-1' },
      { currency: 'XLM.USDC', amount: 'abc' },
      { currency: 'XLM.USDC', amount: '1.123456789' },
    ],
    payouts: [],
  };
  assert.deepEqual(Holdings.onTheWayFrom(account, walletAddress), [
    { currency: 'XLM.USDC', amount: units.parse('1.1234567'), estimates: undefined },
  ]);
});

test('on the way uses the CTX estimate in the stable before market rates', () => {
  const held = holdings(
    {},
    {
      rates: Rates.fromPrices({}),
      onTheWay: [{ currency: 'XLM', amount: units.parse('10'), estimates: { 'XLM.GBPLOOP': '1.259876543' } }],
    },
  );
  assert.equal(held.onTheWayIn('XLM.GBPLOOP'), units.parse('1.25'));
});

test('an unreadable estimate falls back to market rates', () => {
  const held = holdings(
    {},
    { onTheWay: [{ currency: 'XLM.EURC', amount: units.parse('10'), estimates: { USD: 'n/a' } }] },
  );
  assert.equal(held.onTheWayIn('USD'), units.parse('11.21'));
});

test('an unknown currency with no estimate is skipped, an unpriced known one hides the figure', () => {
  const unknown = holdings(
    {},
    {
      onTheWay: [
        { currency: 'BTC', amount: units.parse('1') },
        { currency: 'XLM.USDC', amount: units.parse('2') },
      ],
    },
  );
  assert.equal(unknown.onTheWayIn('USD'), units.parse('2'));
  const unpriced = holdings({}, { rates: Rates.fromPrices({}), onTheWay: [{ currency: 'XLM', amount: units.parse('1') }] });
  assert.equal(unpriced.onTheWayIn('USD'), null);
});

test('the preferred currency has the largest spendable value', () => {
  const held = holdings({ XLM: '100', 'XLM.EURC': '20', 'XLM.GBPLOOP': '10' });
  assert.equal(held.preferredCurrency(currencies, 'XLM.GBPLOOP', new Set()), 'XLM.EURC');
});

test('a tie on value goes to the stable', () => {
  const held = holdings({ 'XLM.USDC': '5', 'XLM.EURC': '5' }, { rates: Rates.fromPrices({ 'XLM.EURC': '1' }) });
  assert.equal(held.preferredCurrency(currencies, 'XLM.EURC', new Set()), 'XLM.EURC');
  assert.equal(held.preferredCurrency(currencies, 'USD', new Set()), 'XLM.USDC');
});

test('a refused currency is skipped and the next candidate is preferred', () => {
  const held = holdings({ XLM: '100', 'XLM.EURC': '20', 'XLM.GBPLOOP': '10' });
  assert.equal(held.preferredCurrency(currencies, 'XLM.GBPLOOP', new Set(['XLM.EURC'])), 'XLM');
  assert.equal(held.preferredCurrency(currencies, 'XLM.GBPLOOP', new Set(['XLM.EURC', 'XLM'])), 'XLM.GBPLOOP');
});

test('with no priced candidate a funded currency is preferred, the stable first, then USDC', () => {
  const unpriced = holdings({ XLM: '100', 'XLM.USDC': '5', 'XLM.GBPLOOP': '1' }, { rates: Rates.fromPrices({}) });
  assert.equal(unpriced.preferredCurrency(currencies, 'XLM.GBPLOOP', new Set(['XLM.USDC'])), 'XLM.GBPLOOP');
  assert.equal(unpriced.preferredCurrency(currencies, 'XLM.EURC', new Set()), 'XLM.USDC');
  assert.equal(unpriced.preferredCurrency(currencies, 'XLM.EURC', new Set(['XLM.USDC', 'XLM.GBPLOOP'])), 'XLM');
});

test('an unfunded stable is never preferred over a funded currency', () => {
  const held = holdings({ 'XLM.USDC': '5' }, { rates: Rates.fromPrices({}) });
  assert.equal(held.preferredCurrency(currencies, 'XLM.GBPLOOP', new Set()), 'XLM.USDC');
});

test('nothing is preferred when no funded currency is accepted', () => {
  const onlyXlm = holdings({ XLM: '100' });
  assert.equal(onlyXlm.preferredCurrency(currencies, 'XLM.GBPLOOP', new Set(['XLM'])), null);
  assert.equal(holdings({}).preferredCurrency(currencies, 'USD', new Set()), null);
  assert.equal(holdings({ 'XLM.USDC': '1' }).preferredCurrency(currencies, 'USD', new Set(currencies)), null);
});
