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
