import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';

import { units } from '../stellar/units.ts';
import { Deadline } from './deadline.ts';
import { Rates } from './rates.ts';

const realFetch = globalThis.fetch;

afterEach(() => {
  mock.timers.reset();
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

type Quote = { baseCurrency: string; price: string; quoteCurrency: string; retrieved: string; source: string; symbol: string };

function quote(symbol: string, price: string, source: string): Quote {
  return {
    baseCurrency: symbol.slice(0, 3),
    price,
    quoteCurrency: 'USD',
    retrieved: '2026-10-27T09:12:37.947885366Z',
    source,
    symbol,
  };
}

test('a pair the ctx source does not quote falls back to the unfiltered answer, as the live service returns for GBPUSD', async () => {
  const requested: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    requested.push(url.search);
    const symbol = url.searchParams.get('symbol') ?? '';
    if (symbol === 'GBPUSD') {
      const quotes = url.searchParams.get('source') === 'ctx' ? [] : [quote('GBPUSD', '1.3316', 'kraken')];
      return new Response(JSON.stringify(quotes), { status: 200 });
    }
    return new Response(JSON.stringify([quote(symbol, '1.1154', 'ctx-average')]), { status: 200 });
  }) as typeof fetch;
  const rates = await Rates.fetch(['XLM.GBPLOOP', 'XLM.EURC']);
  assert.equal(rates.usdPrice('XLM.GBPLOOP'), units.parse('1.3316'));
  assert.equal(rates.usdPrice('XLM.EURC'), units.parse('1.1154'));
  assert.deepEqual(requested.sort(), [
    '?symbol=EURUSD&source=ctx',
    '?symbol=GBPUSD',
    '?symbol=GBPUSD&source=ctx',
  ]);
});

test('a pair with no quote from any source stays unpriced', async () => {
  globalThis.fetch = (async () => new Response('[]', { status: 200 })) as typeof fetch;
  const rates = await Rates.fetch(['XLM.GBPLOOP']);
  assert.equal(rates.usdPrice('XLM.GBPLOOP'), null);
});

test('a price that is not a string leaves the currency unpriced', async () => {
  globalThis.fetch = (async () => new Response('[{"price":1.33}]', { status: 200 })) as typeof fetch;
  const rates = await Rates.fetch(['XLM.GBPLOOP']);
  assert.equal(rates.usdPrice('XLM.GBPLOOP'), null);
});

test('a rate request that never answers leaves the currency unpriced once the deadline passes', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  let aborted = 0;
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>(() => {
      init?.signal?.addEventListener('abort', () => {
        aborted += 1;
      });
    })) as typeof fetch;
  const pending = Rates.fetch(['XLM']);
  mock.timers.tick(Deadline.requestMs - 1);
  await new Promise((resolve) => setImmediate(resolve));
  mock.timers.tick(1);
  const rates = await pending;
  assert.equal(rates.usdPrice('XLM'), null);
  assert.equal(aborted, 1);
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
