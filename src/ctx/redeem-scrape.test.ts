import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseCardDetails, readPageLines } from './redeem-scrape.ts';

test('reads a labelled code and pin from a hosted reveal page', () => {
  const lines = ['Tesco', '10.00 GBP', 'Gift card code', '1234567890123456', 'Pin', '4321', 'Issued 4 Nov 2026'];
  assert.deepEqual(parseCardDetails(lines), { number: '1234567890123456', pin: '4321' });
});

test('reads sibling code and pin labels the way provider reveal pages lay them out', () => {
  const lines = ['Your gift card', 'Code', '6012 3456 7890 1234', 'PIN', '98765', 'Expires 2027'];
  assert.deepEqual(parseCardDetails(lines), { number: '6012345678901234', pin: '98765' });
});

test('reads inline label and value pairs', () => {
  const lines = ['Card number: 6012-3456-7890-1234', 'Security code: 1234'];
  assert.deepEqual(parseCardDetails(lines), { number: '6012345678901234', pin: '1234' });
});

test('a card without a pin still saves its number', () => {
  const lines = ['eGift card number', 'ABCD1234EFGH5678', 'Balance £10'];
  assert.deepEqual(parseCardDetails(lines), { number: 'ABCD1234EFGH5678', pin: '' });
});

test('skips labels without a nearby value and prose that mentions a code', () => {
  const lines = [
    'Redeem Challenge',
    '123456',
    'You may be asked to enter this confirmation code when redeeming.',
    'Redeem',
    'Order number',
    'ORD-2026-11-04',
  ];
  assert.equal(parseCardDetails(lines), null);
});

test('a pin never duplicates the number and a page without a code returns nothing', () => {
  assert.deepEqual(parseCardDetails(['Code', '1234567890', 'PIN', '1234567890']), { number: '1234567890', pin: '' });
  assert.equal(parseCardDetails(['Great news. Your gift card is on its way.', "I'm not a robot", 'Get your Gift Card']), null);
  assert.equal(parseCardDetails([]), null);
});

test('page messages are read defensively', () => {
  assert.deepEqual(readPageLines('{"lines":["Code","12345678901",7,null]}'), ['Code', '12345678901']);
  assert.deepEqual(readPageLines('{"lines":"Code"}'), []);
  assert.deepEqual(readPageLines('not json'), []);
});
