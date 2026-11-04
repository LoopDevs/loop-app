import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BankLink } from './bank-link.ts';

const metadata = { linkSessionId: 's1', requestId: 'r1' };

test('leaving Link keeps the error code and the message meant for the user', () => {
  assert.deepEqual(
    BankLink.left({
      metadata,
      error: {
        errorCode: 'INSTITUTION_DOWN' as never,
        errorType: 'INSTITUTION_ERROR' as never,
        errorMessage: 'institution down',
        displayMessage: 'Your bank is unavailable right now.',
      },
    }),
    { kind: 'left', errorCode: 'INSTITUTION_DOWN', displayMessage: 'Your bank is unavailable right now.' },
  );
});

test('closing Link without an error reports nothing', () => {
  assert.deepEqual(BankLink.left({ metadata }), { kind: 'left', errorCode: null, displayMessage: null });
});

const success = { metadata: { linkSessionId: 's1', accounts: [] } };

test('a successful Link remembers the bank it was approved at', () => {
  assert.deepEqual(
    BankLink.approved({
      publicToken: 'public-1',
      metadata: { ...success.metadata, institution: { id: 'ins_117650', name: 'Monzo' } },
    } as never),
    { kind: 'approved', institution: { id: 'ins_117650', name: 'Monzo' } },
  );
});

test('a success without a bank remembers nothing', () => {
  assert.deepEqual(BankLink.approved({ publicToken: 'public-1', metadata: success.metadata } as never), {
    kind: 'approved',
    institution: null,
  });
});

const event = (eventName: string, viewName: string, institutionName?: string) =>
  ({ eventName, metadata: { linkSessionId: 's1', viewName, institutionName } }) as never;

test('handing off to the bank reports the bank being approved in', () => {
  assert.deepEqual(BankLink.progress(event('OPEN_OAUTH', 'OAUTH', 'Monzo')), { step: 'atBank', bankName: 'Monzo' });
  assert.deepEqual(BankLink.progress(event('TRANSITION_VIEW', 'OAUTH')), { step: 'atBank', bankName: null });
});

test('coming back from the bank is reported once Link resumes', () => {
  assert.deepEqual(BankLink.progress(event('CLOSE_OAUTH', 'OAUTH')), { step: 'backFromBank' });
  assert.deepEqual(BankLink.progress(event('TRANSITION_VIEW', 'CONNECTED')), { step: 'backFromBank' });
  assert.deepEqual(BankLink.progress(event('TRANSITION_VIEW', 'LOADING')), { step: 'backFromBank' });
});

test('other Link events are not progress', () => {
  assert.equal(BankLink.progress(event('OPEN', 'CONSENT')), null);
  assert.equal(BankLink.progress(event('TRANSITION_VIEW', 'CONSENT')), null);
});
