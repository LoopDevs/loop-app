import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pageLinesScript, parseCardDetails, readPageLines, RedeemPage } from './redeem-scrape.ts';

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

function pageLines(nodes: FakeNode[], typedInto: FakeNode[] = []): string[] {
  const sent: string[] = [];
  const document = {
    addEventListener: (_name: string, listener: (event: { isTrusted: boolean; target: FakeNode }) => void) => {
      for (const target of typedInto) {
        listener({ isTrusted: true, target });
      }
    },
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

test('reads a header row of labels followed by their values', () => {
  const lines = ['Card number', 'PIN', '6012 3456 7890 1234', '4321'];
  assert.deepEqual(parseCardDetails(lines), { number: '6012345678901234', pin: '4321' });
});

test('a line of words with digits is never read as the card number', () => {
  assert.equal(parseCardDetails(['Gift card number', 'Order number 12345678901']), null);
  assert.equal(parseCardDetails(['Gift card code', 'Call 1-800-555-0199']), null);
  assert.deepEqual(parseCardDetails(['Gift card code', 'ABCD 1234 EFGH 5678']), { number: 'ABCD1234EFGH5678', pin: '' });
  assert.deepEqual(parseCardDetails(['Gift card code', '8f3a dbce 41c2 9e07']), { number: '8f3adbce41c29e07', pin: '' });
});

test('a header row with other columns never saves a value from the wrong column', () => {
  const rows = [
    ['Order number', 'Card number', 'PIN', 'TXN20261116001', '6012 3456 7890 1234', '4321'],
    ['Order ID', 'Card number', 'PIN', 'TXN20261116001', '6012 3456 7890 1234', '4321'],
    ['Reference', 'Card number', 'PIN', '100045678912', '6012 3456 7890 1234', '4321'],
    ['Serial', 'Batch', 'Card number', 'PIN', 'SN1234567890', 'B987654321', '6012 3456 7890 1234', '4321'],
    ['Card number', 'PIN', 'Expiry', '6012 3456 7890 1234', '4321', '12/2027'],
    ['Card number', 'PIN', 'Status', '6012 3456 7890 1234', '4321', 'Active'],
  ];
  for (const row of rows) {
    const read = parseCardDetails(row);
    assert.ok(read === null || read.number === '6012345678901234', row.join(' | '));
  }
});

test('a heading above the card label and a button after its value still read the value', () => {
  assert.deepEqual(parseCardDetails(['Your code', 'Card number', '6006 1234 5678 9012', 'Copy']), {
    number: '6006123456789012',
    pin: '',
  });
  assert.deepEqual(parseCardDetails(['Redeem with this code', 'Gift card code', '6006 1234 5678 9012', 'Copy code']), {
    number: '6006123456789012',
    pin: '',
  });
});

test('two possible codes under one label save nothing', () => {
  assert.equal(parseCardDetails(['Gift card code', '6012 3456 7890 1234', '7777 8888 9999 0000']), null);
});

test('a phone number or a prefixed reference is never read as the card number', () => {
  assert.equal(parseCardDetails(['Gift card code', '020 7946 0958']), null);
  assert.equal(parseCardDetails(['Gift card code', '0800 123 4567']), null);
  assert.equal(parseCardDetails(['Gift card code', '01 23 45 67 89']), null);
  assert.equal(parseCardDetails(['Gift card code', '02079460958']), null);
  assert.equal(parseCardDetails(['Gift card code', 'ref 1234567890']), null);
  assert.equal(parseCardDetails(['Gift card code', 'REF 1234567890']), null);
  assert.equal(parseCardDetails(['Gift card code', 'REF1234567890']), null);
  assert.equal(parseCardDetails(['Gift card code', 'TXN20261116001']), null);
  assert.equal(parseCardDetails(['Gift card code', 'ORDER 123456789012']), null);
  assert.deepEqual(parseCardDetails(['Gift card code', '6012 3456 7890 1234 567']), { number: '6012345678901234567', pin: '' });
});

test('a header row with a missing value saves nothing rather than shifting the pin into the number', () => {
  assert.equal(parseCardDetails(['Card number', 'PIN', '1234567890']), null);
});

test('page messages are read defensively', () => {
  assert.deepEqual(readPageLines('{"lines":["Code","12345678901",7,null]}'), ['Code', '12345678901']);
  assert.deepEqual(readPageLines('{"lines":"Code"}'), []);
  assert.deepEqual(readPageLines('not json'), []);
});

test('a field the user typed into is never read, even once the page locks it', () => {
  const typedCard = field('4111 1111 1111 1111', { disabled: true });
  const shownCode = field('ABCD1234EFGH5678', { readOnly: true });
  assert.deepEqual(pageLines([text('Card number'), typedCard, shownCode], [typedCard]), ['Card number', 'ABCD1234EFGH5678']);
});

test('card details are accepted only from the redeem link host and the page it first lands on', () => {
  const page = new RedeemPage('https://spend.ctx.com/r/abc');
  assert.equal(page.trusts('https://spend.ctx.com/r/abc?x=1'), true);
  assert.equal(page.trusts('https://supplier.example/card'), false);
  page.land('https://supplier.example/card');
  assert.equal(page.trusts('https://supplier.example/card/view'), true);
  page.land('https://elsewhere.example/');
  assert.equal(page.trusts('https://elsewhere.example/'), false);
  assert.equal(page.trusts('http://supplier.example/card'), false);
  assert.equal(page.trusts('about:blank'), false);
  assert.equal(page.trusts('not a url'), false);
});
