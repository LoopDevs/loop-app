import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { units } from '../stellar/units.ts';
import { Rates } from './rates.ts';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

test('prices parse into 7-decimal units and drop digits past the seventh', () => {
  const rates = Rates.fromPrices({ XLM: '0.168712349', 'XLM.EURC': '1.1212' });
  assert.equal(rates.usdPrice('XLM'), units.parse('0.1687123'));
  assert.equal(rates.usdPrice('XLM.EURC'), units.parse('1.1212'));
});

test('a missing, malformed or zero price leaves the currency unpriced', () => {
  const rates = Rates.fromPrices({ XLM: null, 'XLM.EURC': '1e3', 'XLM.GBPLOOP': '0' });
  assert.equal(rates.usdPrice('XLM'), null);
  assert.equal(rates.usdPrice('XLM.EURC'), null);
  assert.equal(rates.usdPrice('XLM.GBPLOOP'), null);
  assert.equal(rates.usdPrice('BTC'), null);
});

test('USD and USDC are priced at 1', () => {
  const rates = Rates.fromPrices({});
  assert.equal(rates.usdPrice('USD'), Rates.one);
  assert.equal(rates.usdPrice('XLM.USDC'), Rates.one);
});

test('fetch reads each stable through its pegged fiat market and skips USDC', async () => {
  const requested: string[] = [];
  const prices: Record<string, string> = { XLMUSD: '0.1686', EURUSD: '1.1212', GBPUSD: '1.3378' };
  globalThis.fetch = (async (input: string | URL | Request) => {
    const symbol = new URL(String(input)).searchParams.get('symbol') ?? '';
    requested.push(symbol);
    return new Response(JSON.stringify([{ symbol, price: prices[symbol] }]), { status: 200 });
  }) as typeof fetch;
  const rates = await Rates.fetch(['XLM', 'XLM.USDC', 'XLM.EURC', 'XLM.GBPLOOP']);
  assert.deepEqual(requested.sort(), ['EURUSD', 'GBPUSD', 'XLMUSD']);
  assert.equal(rates.usdPrice('XLM'), units.parse('0.1686'));
  assert.equal(rates.usdPrice('XLM.EURC'), units.parse('1.1212'));
  assert.equal(rates.usdPrice('XLM.GBPLOOP'), units.parse('1.3378'));
});

test('a failed or empty rate response leaves that currency unpriced', async () => {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const symbol = new URL(String(input)).searchParams.get('symbol');
    if (symbol === 'XLMUSD') {
      throw new Error('offline');
    }
    if (symbol === 'EURUSD') {
      return new Response('[]', { status: 200 });
    }
    return new Response('{}', { status: 500 });
  }) as typeof fetch;
  const rates = await Rates.fetch(['XLM', 'XLM.EURC', 'XLM.GBPLOOP']);
  assert.equal(rates.usdPrice('XLM'), null);
  assert.equal(rates.usdPrice('XLM.EURC'), null);
  assert.equal(rates.usdPrice('XLM.GBPLOOP'), null);
});
