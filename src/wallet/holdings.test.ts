import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Account } from '../ctx/account.ts';
import type { BalanceJson } from '../ctx/client.ts';
import type { PayoutJson } from '../ctx/payout.ts';
import { Rates } from '../ctx/rates.ts';
import { network, type PaymentCurrency } from '../stellar/network.ts';
import { units } from '../stellar/units.ts';
import { Holdings } from './holdings.ts';

const walletAddress = 'CWALLET';

const currencies: PaymentCurrency[] =['XLM', 'XLM.USDC', 'XLM.EURC', 'XLM.GBPLOOP'];

const marketRates = Rates.fromPrices({
  XLM: '0.16870',
  'XLM.EURC': '1.12120',
  'XLM.GBPLOOP': '1.33670',
});

function holdings(
  wallet: Partial<Record<PaymentCurrency, string>>,
  options: { savings?: Partial<Record<PaymentCurrency, string>>; rates?: Rates } = {},
): Holdings {
  const tokens = currencies.map((currency) => ({
    token: { currency, symbol: currency, contract: '' },
    amount: units.parse(wallet[currency] ?? '0'),
  }));
  const savings = Object.entries(options.savings ?? {}).map(([currency, amount]) => {
    const value = units.parse(amount);
    return { currency: currency as PaymentCurrency, shares: value, value };
  });
  return new Holdings({ tokens, savings }, options.rates ?? marketRates);
}

function payout(overrides: Partial<PayoutJson>): PayoutJson {
  return {
    id: 'p1',
    status: 'pending',
    currency: 'XLM.GBPLOOP',
    amount: '1',
    address: walletAddress,
    reservationTransferId: 't1',
    ...overrides,
  };
}

function accountOf(wallet: BalanceJson[], payouts: PayoutJson[] = []): Account {
  return new Account({ wallet, payouts });
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

test('spendable USDC adds the full savings value to the wallet balance', () => {
  const held = holdings({ 'XLM.USDC': '5', XLM: '20' }, { savings: { 'XLM.USDC': '10' } });
  assert.equal(held.spendable('XLM.USDC'), units.parse('15'));
  assert.equal(held.spendable('XLM'), units.parse('20'));
  assert.equal(held.spendable('XLM.EURC'), 0n);
});

test('savings holdings and spending both count each vault at its full value', () => {
  const held = holdings({}, { savings: { 'XLM.USDC': '10' } });
  assert.deepEqual(held.savingsHoldings(), [{ currency: 'XLM.USDC', amount: units.parse('10') }]);
  assert.equal(held.savings('XLM.USDC'), units.parse('10'));
  assert.deepEqual(holdings({}).savingsHoldings(), []);
  assert.equal(holdings({}).savings('XLM.USDC'), 0n);
});

test('each savings currency counts only its own vault', () => {
  network.vaults['XLM.GBPLOOP'] = 'CGBPLOOPVAULT';
  try {
    const held = holdings({ 'XLM.USDC': '5', 'XLM.GBPLOOP': '1' }, { savings: { 'XLM.USDC': '10', 'XLM.GBPLOOP': '2' } });
    assert.equal(held.spendable('XLM.USDC'), units.parse('15'));
    assert.equal(held.spendable('XLM.GBPLOOP'), units.parse('3'));
    assert.deepEqual(held.coverage('XLM.GBPLOOP', units.parse('2.5')), {
      kind: 'savings',
      fromSavings: units.parse('1.5'),
    });
    assert.deepEqual(held.coverage('XLM.GBPLOOP', units.parse('3.5')), { kind: 'short' });
    assert.deepEqual(held.savingsHoldings(), [
      { currency: 'XLM.USDC', amount: units.parse('10') },
      { currency: 'XLM.GBPLOOP', amount: units.parse('2') },
    ]);
  } finally {
    delete network.vaults['XLM.GBPLOOP'];
  }
});

test('shares whose withdrawal floor is nothing are neither shown nor withdrawable', () => {
  const dust = holdings({}, { savings: { 'XLM.USDC': '0.0000001' } });
  assert.deepEqual(dust.savingsHoldings(), []);
  assert.deepEqual(dust.withdrawableSavings(), []);
});

test('a token with no rate hides the converted spendable figure', () => {
  const held = holdings({ XLM: '10', 'XLM.USDC': '1' }, { rates: Rates.fromPrices({}) });
  assert.equal(held.inWalletIn('USD'), null);
  assert.equal(held.totalIn('USD'), null);
});

test('an in-flight or completed payout to another wallet is reported as paid elsewhere', () => {
  const paidElsewhere = (overrides: Parameters<typeof payout>[0]) =>
    Holdings.paidElsewhere(accountOf([], [payout(overrides)]), walletAddress);
  assert.equal(paidElsewhere({ address: 'GELSEWHERE' }), true);
  assert.equal(paidElsewhere({ address: 'GELSEWHERE', status: 'complete' }), true);
  assert.equal(paidElsewhere({}), false);
  assert.equal(paidElsewhere({ status: 'complete' }), false);
  assert.equal(paidElsewhere({ address: undefined }), false);
  assert.equal(paidElsewhere({ address: 'GELSEWHERE', status: 'cancelled' }), false);
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

test('when the display currency has no rate, a priced stablecoin is ranked by its amount, not passed over for a near-empty stable', () => {
  const held = holdings({ 'XLM.EURC': '100', 'XLM.GBPLOOP': '0.01' }, { rates: Rates.fromPrices({ 'XLM.EURC': '1.1' }) });
  assert.equal(held.preferredCurrency(currencies, 'XLM.GBPLOOP', new Set()), 'XLM.EURC');
});

test('a stablecoin without its own rate is not ranked by its amount, because it cannot pass the price check', () => {
  const held = holdings({ 'XLM.EURC': '100', 'XLM.GBPLOOP': '0.01' }, { rates: Rates.fromPrices({ 'XLM.GBPLOOP': '1.3' }) });
  assert.equal(held.preferredCurrency(currencies, 'XLM.GBPLOOP', new Set()), 'XLM.GBPLOOP');
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

test('the total counts savings at the value the savings rows show', () => {
  const held = holdings(
    { 'XLM.GBPLOOP': '2' },
    { savings: { 'XLM.GBPLOOP': '50' } },
  );
  const rows = held.savingsHoldings().reduce((sum, { amount }) => sum + amount, 0n);
  assert.equal(rows, units.parse('50'));
  assert.equal(held.savedIn('XLM.GBPLOOP'), rows);
  assert.equal(held.totalIn('XLM.GBPLOOP'), units.parse('52'));
});

test('the wallet figure counts every token at its rate and leaves savings out', () => {
  const held = holdings({ 'XLM.GBPLOOP': '2', 'XLM.EURC': '10' }, { savings: { 'XLM.GBPLOOP': '50' } });
  const withoutSavings = holdings({ 'XLM.GBPLOOP': '2', 'XLM.EURC': '10' });
  assert.equal(held.inWalletIn('XLM.GBPLOOP'), withoutSavings.inWalletIn('XLM.GBPLOOP'));
  assert.equal(holdings({ 'XLM.EURC': '10' }).inWallet('XLM.GBPLOOP'), 0n);
  assert.notEqual(holdings({ 'XLM.EURC': '10' }).inWalletIn('XLM.GBPLOOP'), 0n);
});

test('amounts in several currencies are summed at their rates, and unknown without a rate', () => {
  const held = holdings({});
  const amounts = [
    { currency: 'XLM.GBPLOOP', amount: units.parse('1') },
    { currency: 'XLM.EURC', amount: units.parse('10') },
  ];
  assert.equal(held.sumIn(amounts, 'XLM.GBPLOOP'), units.parse('9.3878207'));
  assert.equal(holdings({}, { rates: Rates.fromPrices({}) }).sumIn(amounts, 'XLM.GBPLOOP'), null);
});

test('received cashback is grouped by currency', () => {
  const account = accountOf(
    [],
    [
      payout({ id: 'a', status: 'complete', currency: 'XLM.GBPLOOP', amount: '1' }),
      payout({ id: 'b', status: 'complete', currency: 'XLM.EURC', amount: '2' }),
      payout({ id: 'c', status: 'complete', currency: 'XLM.EURC', amount: '3' }),
      payout({ id: 'd', status: 'pending', currency: 'XLM.EURC', amount: '9' }),
    ],
  );
  assert.deepEqual(account.receivedCashbackByCurrency(new Set(['XLM.GBPLOOP', 'XLM.EURC'])), [
    { currency: 'XLM.GBPLOOP', amount: units.parse('1') },
    { currency: 'XLM.EURC', amount: units.parse('5') },
  ]);
});

test('money in the wallet that savings takes can move to savings from the move minimum', () => {
  const movable = holdings({ 'XLM.USDC': '2.5', 'XLM.EURC': '4', XLM: '10' }).movableToSavings();
  assert.deepEqual(movable, [{ currency: 'XLM.USDC', amount: units.parse('2.5') }]);
  assert.deepEqual(holdings({ 'XLM.USDC': '0.9999999' }).movableToSavings(), []);
});
