import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RedeemCapture } from './redeem-capture.ts';

test('card numbers, pins and mixed codes are masked while labels and structure stay', () => {
  const masked = RedeemCapture.mask(
    '<div class="card col-6" id="pin1"><h2>Card number</h2><span>6033 1234 5678 9012</span>' +
      '<p>PIN: 4821</p><p>Code ABCD-12EF-9XYZ</p></div>',
  );
  assert.equal(
    masked,
    '<div class="card col-6" id="pin1"><h2>Card number</h2><span>0000 0000 0000 0000</span>' +
      '<p>PIN: 0000</p><p>Code XXXX-00XX-0XXX</p></div>',
  );
});

test('scripts, styles, drawings and comments are emptied', () => {
  const masked = RedeemCapture.mask(
    '<script>var code = "6033123456789012";</script><style>.a{color:red}</style>' +
      '<svg viewBox="0 0 10 10"><rect x="1"/></svg><!-- 6033123456789012 --><p>Done</p>',
  );
  assert.equal(masked, '<script></script><style></style><svg></svg><p>Done</p>');
});

test('attribute values are masked, with links cut to a masked path', () => {
  const masked = RedeemCapture.mask(
    '<input type="text" name="pin" value="4821" readonly="">' +
      '<a href="https://cards.example.com/r/AbCdEfGhIjKlMnOpQr/view?token=SeCrEt#x" style="color:red">Open</a>' +
      '<img src="data:image/png;base64,AAAA" alt="Barcode 6033123456789012">',
  );
  assert.equal(
    masked,
    '<input type="text" name="pin" value="0000" readonly="">' +
      '<a href="https://cards.example.com/r/XXXXXXXXXXXXXXXXXX/view?masked" style="">Open</a>' +
      '<img src="data:masked" alt="Barcode 0000000000000000">',
  );
});

test('a capture message is read only with a page and a known stage', () => {
  assert.deepEqual(RedeemCapture.read(JSON.stringify({ capture: '<html></html>', stage: 'read' })), {
    stage: 'read',
    html: '<html></html>',
  });
  assert.equal(RedeemCapture.read(JSON.stringify({ capture: '<html></html>', stage: 'other' })), null);
  assert.equal(RedeemCapture.read(JSON.stringify({ lines: ['a'] })), null);
  assert.equal(RedeemCapture.read('not json'), null);
});

test('a timing file is named by time and report', () => {
  assert.equal(
    RedeemCapture.timingFileName('Bank purchase timing', Date.parse('2026-11-20T10:11:12.345Z')),
    '2026-11-20T10-11-12-345Z-bank-purchase-timing.json',
  );
});

test('a saved page is named by time, host, order and stage and carries a masked body', () => {
  const page = { stage: 'loaded' as const, html: '<p>PIN 4821</p>' };
  assert.equal(
    RedeemCapture.fileName('cards.example.com', page, 2, Date.parse('2026-11-20T10:11:12.345Z')),
    '2026-11-20T10-11-12-345Z-cards.example.com-2-loaded.html',
  );
  assert.equal(
    RedeemCapture.document('cards.example.com', 'Example', page),
    '<!-- loop redeem capture: host=cards.example.com merchant=Example stage=loaded -->\n<p>PIN 0000</p>',
  );
});
