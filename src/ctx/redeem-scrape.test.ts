import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pageLinesScript, parseCardDetails, readPageLines } from './redeem-scrape.ts';

type FakeNode = Record<string, unknown>;

function text(content: string): FakeNode {
  return { nodeType: 3, textContent: content, parentElement: { tagName: 'P', closest: () => null } };
}

function field(
  value: string,
  locked: { readOnly?: boolean; disabled?: boolean } = {},
  autocomplete: string | null = null,
): FakeNode {
  return {
    nodeType: 1,
    tagName: 'INPUT',
    getAttribute: (name: string) => (name === 'autocomplete' ? autocomplete : 'text'),
    value,
    readOnly: false,
    disabled: false,
    ...locked,
  };
}

function pageLines(nodes: FakeNode[]): string[] {
  const sent: string[] = [];
  const document = {
    body: {},
    documentElement: {},
    createTreeWalker: () => {
      let index = 0;
      return { nextNode: () => nodes[index++] ?? null };
    },
  };
  const window = { ReactNativeWebView: { postMessage: (message: string) => sent.push(message) } };
  const run = new Function('window', 'document', 'NodeFilter', 'MutationObserver', 'setTimeout', 'clearTimeout', pageLinesScript);
  run(
    window,
    document,
    { SHOW_ELEMENT: 1, SHOW_TEXT: 4 },
    class {
      observe() {}
    },
    (callback: () => void) => callback(),
    () => undefined,
  );
  return readPageLines(sent[0] ?? '');
}

test('the page script reads shown text and locked fields but never what the user types', () => {
  const lines = pageLines([
    text('Card number'),
    field('4111 1111 1111 1111'),
    text('Gift card code'),
    field('ABCD1234EFGH5678', { readOnly: true }),
    text('Pin'),
    field('4321', { disabled: true }),
  ]);
  assert.deepEqual(lines, ['Card number', 'Gift card code', 'ABCD1234EFGH5678', 'Pin', '4321']);
  assert.deepEqual(parseCardDetails(lines), { number: 'ABCD1234EFGH5678', pin: '4321' });
});

test('the page script skips a payment card field even once the checkout locks it', () => {
  const lines = pageLines([text('Card number'), field('4111111111111111', { disabled: true }, 'cc-number')]);
  assert.deepEqual(lines, ['Card number']);
  assert.equal(parseCardDetails(lines), null);
});

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

test('a value is never read from past the next label', () => {
  const lines = ['Gift card number', 'Order number', '12345678901234'];
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
