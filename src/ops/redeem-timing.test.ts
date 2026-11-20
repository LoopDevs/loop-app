import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RedeemTiming } from './redeem-timing.ts';

test('a saved card reports page load, code read and save times with the page host', () => {
  const timing = new RedeemTiming('https://cards.example.com/r/abc?token=secret', 'Example', 1_000);
  timing.mark('loaded', 9_000);
  timing.mark('loaded', 12_000);
  timing.mark('read', 15_000);
  assert.deepEqual(timing.finish('saved', 15_400), {
    'redeem.loaded_ms': '8000',
    'redeem.read_ms': '6000',
    'redeem.saved_ms': '400',
    'redeem.total_ms': '14400',
    'redeem.outcome': 'saved',
    'redeem.host': 'cards.example.com',
    'redeem.merchant': 'Example',
  });
  assert.equal(timing.finish('closed', 20_000), null);
});

test('a page closed before a code is read reports how long it was open', () => {
  const timing = new RedeemTiming('not a url', 'Example', 0);
  timing.mark('loaded', 5_000);
  assert.deepEqual(timing.finish('closed', 30_000), {
    'redeem.loaded_ms': '5000',
    'redeem.closed_ms': '25000',
    'redeem.total_ms': '30000',
    'redeem.outcome': 'closed',
    'redeem.host': 'unknown',
    'redeem.merchant': 'Example',
  });
});
