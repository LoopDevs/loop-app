import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PurchaseTiming } from './purchase-timing.ts';

test('a finished purchase reports the time each stage took and the total', () => {
  PurchaseTiming.start(1_000);
  PurchaseTiming.ordered('o1', 1_800);
  PurchaseTiming.mark('atBank', 'o1', 4_000);
  PurchaseTiming.mark('backFromBank', 'o1', 9_000);
  PurchaseTiming.mark('approved', 'o1', 9_500);
  PurchaseTiming.mark('charged', 'o1', 11_000);
  assert.deepEqual(PurchaseTiming.finish('o1', 15_000), {
    'purchase.ordered_ms': '800',
    'purchase.atBank_ms': '2200',
    'purchase.backFromBank_ms': '5000',
    'purchase.approved_ms': '500',
    'purchase.charged_ms': '1500',
    'purchase.delivered_ms': '4000',
    'purchase.total_ms': '14000',
  });
  assert.equal(PurchaseTiming.finish('o1', 16_000), null);
});

test('a stage keeps its first time and a skipped stage is left out', () => {
  PurchaseTiming.start(0);
  PurchaseTiming.ordered('o1', 100);
  PurchaseTiming.mark('charged', 'o1', 500);
  PurchaseTiming.mark('charged', 'o1', 900);
  assert.deepEqual(PurchaseTiming.finish('o1', 1_000), {
    'purchase.ordered_ms': '100',
    'purchase.charged_ms': '400',
    'purchase.delivered_ms': '500',
    'purchase.total_ms': '1000',
  });
});

test('another order, a dropped purchase and an order opened later report nothing', () => {
  PurchaseTiming.start(0);
  PurchaseTiming.ordered('o1', 100);
  PurchaseTiming.mark('charged', 'o2', 200);
  assert.equal(PurchaseTiming.finish('o2', 300), null);
  PurchaseTiming.drop();
  assert.equal(PurchaseTiming.finish('o1', 400), null);
});
