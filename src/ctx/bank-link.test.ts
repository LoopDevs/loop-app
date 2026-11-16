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

const event = (eventName: string, viewName: string, institutionName?: string, errorCode?: string) =>
  ({ eventName, metadata: { linkSessionId: 's1', viewName, institutionName, errorCode } }) as never;

test('handing off to the bank reports the bank being approved in', () => {
  assert.deepEqual(BankLink.progress(event('OPEN_OAUTH', 'OAUTH', 'Monzo')), { step: 'atBank', bankName: 'Monzo' });
  assert.deepEqual(BankLink.progress(event('TRANSITION_VIEW', 'OAUTH')), { step: 'atBank', bankName: null });
});

test('the bank handing back or Link finishing reports the payment being confirmed', () => {
  assert.deepEqual(BankLink.progress(event('CLOSE_OAUTH', 'OAUTH')), { step: 'confirming' });
  assert.deepEqual(BankLink.progress(event('HANDOFF', 'CONNECTED')), { step: 'confirming' });
});

test('a loading or connected view reports Link resuming', () => {
  assert.deepEqual(BankLink.progress(event('TRANSITION_VIEW', 'CONNECTED')), { step: 'backFromBank' });
  assert.deepEqual(BankLink.progress(event('TRANSITION_VIEW', 'LOADING')), { step: 'backFromBank' });
});

test('the bank list and a picked bank are reported', () => {
  assert.deepEqual(BankLink.progress(event('TRANSITION_VIEW', 'SELECT_INSTITUTION')), { step: 'choosingBank' });
  assert.deepEqual(BankLink.progress(event('SEARCH_INSTITUTION', 'SELECT_INSTITUTION')), { step: 'choosingBank' });
  assert.deepEqual(BankLink.progress(event('SELECT_INSTITUTION', 'SELECT_INSTITUTION', 'Monzo')), {
    step: 'bankChosen',
    bankName: 'Monzo',
  });
});

test('a Link error, a failed bank hand-off and an unavailable bank are reported with their code', () => {
  assert.deepEqual(BankLink.progress(event('ERROR', 'ERROR', 'Monzo', 'INSTITUTION_DOWN')), {
    step: 'problem',
    code: 'INSTITUTION_DOWN',
  });
  assert.deepEqual(BankLink.progress(event('FAIL_OAUTH', 'OAUTH')), { step: 'problem', code: 'FAIL_OAUTH' });
  assert.deepEqual(BankLink.progress(event('TRANSITION_VIEW', 'ERROR')), { step: 'problem', code: 'TRANSITION_VIEW' });
  assert.deepEqual(BankLink.progress(event('SELECT_DOWN_INSTITUTION', 'SELECT_INSTITUTION', 'Monzo')), {
    step: 'problem',
    code: 'SELECT_DOWN_INSTITUTION',
  });
});

test('the approval step follows the bank list, the bank visit and the return', () => {
  assert.equal(BankLink.next('opening', { step: 'choosingBank' }), 'choosing');
  assert.equal(BankLink.next('choosing', { step: 'bankChosen', bankName: 'Monzo' }), 'opening');
  assert.equal(BankLink.next('opening', { step: 'atBank', bankName: 'Monzo' }), 'atBank');
  assert.equal(BankLink.next('atBank', { step: 'backFromBank' }), 'confirming');
  assert.equal(BankLink.next('opening', { step: 'confirming' }), 'confirming');
});

test('a loading view before the bank visit, a late bank list and a problem keep the step', () => {
  assert.equal(BankLink.next('opening', { step: 'backFromBank' }), 'opening');
  assert.equal(BankLink.next('atBank', { step: 'choosingBank' }), 'atBank');
  assert.equal(BankLink.next('atBank', { step: 'problem', code: 'FAIL_OAUTH' }), 'atBank');
});

test('a second bank visit after a return shows the bank step', () => {
  assert.equal(BankLink.next('confirming', { step: 'atBank', bankName: null }), 'atBank');
});

test('other Link events are not progress', () => {
  assert.equal(BankLink.progress(event('OPEN', 'CONSENT')), null);
  assert.equal(BankLink.progress(event('TRANSITION_VIEW', 'CONSENT')), null);
});

test('the bank return link is the path iOS hands to the app, with or without the site and query', () => {
  assert.equal(BankLink.isReturn(BankLink.returnPath), true);
  assert.equal(BankLink.isReturn('https://loopfinance.io/plaid/oauth?oauth_state_id=abc'), true);
  assert.equal(BankLink.isReturn('/plaid/oauth?oauth_state_id=abc'), true);
  assert.equal(BankLink.isReturn('/plaid/oauthx'), false);
  assert.equal(BankLink.isReturn('https://evil.example/plaid/oauth'), false);
  assert.equal(BankLink.isReturn('/shop/plaid/oauth'), false);
});

test('the iOS app links claim the bank return path', async () => {
  const { readFile } = await import('node:fs/promises');
  const site = JSON.parse(await readFile('public/.well-known/apple-app-site-association', 'utf8')) as {
    applinks: { details: { components: { '/': string }[] }[] };
  };
  const paths = site.applinks.details.flatMap((detail) => detail.components.map((component) => component['/']));
  assert.ok(paths.includes(BankLink.returnPath));
});
