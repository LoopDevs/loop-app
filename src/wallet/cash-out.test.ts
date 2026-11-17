import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BankWithdrawal, type BankWithdrawalIn, type BankWithdrawalJson } from '../ctx/bank-withdrawal.ts';
import type { PaymentState } from '../ctx/payment-state.ts';
import { units } from '../stellar/units.ts';
import { CashOut, type CashOutSteps } from './cash-out.ts';
import type { TopUpOutcome } from './savings-top-up.ts';

const now = Date.parse('2026-11-17T12:00:00Z');

const request: BankWithdrawalIn = {
  currency: 'XLM.GBPLOOP',
  amount: '25.00',
  sortCode: '112233',
  accountNumber: '12345678',
};

function withdrawal(json: Partial<BankWithdrawalJson> = {}): BankWithdrawal {
  return new BankWithdrawal({
    id: 'w1',
    status: 'awaiting-payment',
    amount: '25',
    currency: 'XLM.GBPLOOP',
    accountName: 'Sam Smith',
    sortCode: '112233',
    accountNumberLast4: '5678',
    paymentId: 'p1',
    created: '2026-11-17T11:59:00Z',
    paymentUrlExpiration: '2026-11-17T12:09:00Z',
    ...json,
  });
}

type Calls = { topUps: bigint[]; sends: string[] };

function flow(
  steps: Partial<CashOutSteps> & { topUpOutcome?: TopUpOutcome; sent?: PaymentState } = {},
): { cashOut: CashOut; calls: Calls } {
  const calls: Calls = { topUps: [], sends: [] };
  const cashOut = new CashOut({
    request: async () => withdrawal(),
    recorded: async () => null,
    topUp: async (amount) => {
      calls.topUps.push(amount);
      return steps.topUpOutcome ?? { kind: 'covered' };
    },
    send: async (paid) => {
      calls.sends.push(paid.paymentId);
      return steps.sent ?? { kind: 'confirming', txId: 'tx1' };
    },
    now: () => now,
    ...steps,
  });
  return { cashOut, calls };
}

test('a cash out tops up the requested amount and sends one payment', async () => {
  const { cashOut, calls } = flow();
  const result = await cashOut.start(request);
  assert.equal(result.kind, 'sent');
  assert.deepEqual(calls.topUps, [units.parse('25')]);
  assert.deepEqual(calls.sends, ['p1']);
});

test('a withdrawal that differs from the request is not paid', async () => {
  for (const different of [
    { amount: '250' },
    { sortCode: '998877' },
    { accountNumberLast4: '0000' },
    { currency: 'XLM.USDC' },
    { status: 'in-review' as const },
  ]) {
    const { cashOut, calls } = flow({ request: async () => withdrawal(different) });
    const result = await cashOut.start(request);
    assert.deepEqual(result.kind === 'stopped' && result.message, CashOut.differentRequestMessage);
    assert.deepEqual(calls, { topUps: [], sends: [] });
  }
});

test('nothing is sent when savings does not cover the amount', async () => {
  const outcomes: [TopUpOutcome, string][] = [
    [{ kind: 'notEnough' }, CashOut.notEnoughMessage],
    [{ kind: 'stillShort', moved: 1n, currency: 'XLM.GBPLOOP' }, CashOut.notEnoughMessage],
    [{ kind: 'withdrawFailed' }, CashOut.savingsFailedMessage],
    [{ kind: 'stillMoving', withdrawal: { hash: 'h', expiryLedger: 1 } }, CashOut.savingsMovingMessage],
    [{ kind: 'priceClosing' }, CashOut.outOfTimeMessage],
    [{ kind: 'priceExpired' }, CashOut.outOfTimeMessage],
  ];
  for (const [topUpOutcome, message] of outcomes) {
    const { cashOut, calls } = flow({ topUpOutcome });
    const result = await cashOut.pay(withdrawal());
    assert.deepEqual(result.kind === 'stopped' && result.message, message);
    assert.deepEqual(calls.sends, []);
  }
});

test('a payment already recorded on this device is not topped up or sent again', async () => {
  const sent = flow({ recorded: async () => ({ kind: 'confirming', txId: 'tx1' }) });
  assert.equal((await sent.cashOut.pay(withdrawal())).kind, 'sent');
  assert.deepEqual(sent.calls, { topUps: [], sends: [] });

  const failed = flow({ recorded: async () => ({ kind: 'failed' }) });
  const result = await failed.cashOut.pay(withdrawal());
  assert.deepEqual(result.kind === 'stopped' && result.message, CashOut.failedMessage);
  assert.deepEqual(failed.calls, { topUps: [], sends: [] });
});

test('a withdrawal past its pay window, or one CTX already received, moves no money', async () => {
  const late = flow();
  const closing = await late.cashOut.pay(withdrawal({ paymentUrlExpiration: '2026-11-17T12:00:20Z' }));
  assert.deepEqual(closing.kind === 'stopped' && closing.message, CashOut.outOfTimeMessage);
  const undated = await late.cashOut.pay(withdrawal({ paymentUrlExpiration: undefined }));
  assert.equal(undated.kind, 'stopped');
  assert.deepEqual(late.calls, { topUps: [], sends: [] });

  const received = flow();
  assert.equal((await received.cashOut.pay(withdrawal({ status: 'in-review' }))).kind, 'sent');
  assert.equal((await received.cashOut.pay(withdrawal({ currency: 'XLM.USDC' }))).kind, 'stopped');
  assert.deepEqual(received.calls, { topUps: [], sends: [] });
});

test('a send that did not go out reports why', async () => {
  const cases: [PaymentState, string][] = [
    [{ kind: 'failed' }, CashOut.failedMessage],
    [{ kind: 'priceExpired' }, CashOut.outOfTimeMessage],
    [{ kind: 'notSent', detail: '' }, CashOut.notSentMessage],
    [{ kind: 'notSent', detail: 'Too many requests.' }, 'Too many requests.'],
  ];
  for (const [sent, message] of cases) {
    const result = await flow({ sent }).cashOut.pay(withdrawal());
    assert.deepEqual(result.kind === 'stopped' && result.message, message);
  }
});

test('known refusals have their own wording', () => {
  assert.equal(CashOut.refusalMessage('ErrBankWithdrawalOpen'), CashOut.refusalMessages.ErrBankWithdrawalOpen);
  assert.equal(CashOut.refusalMessage('ErrSomethingElse'), null);
  assert.equal(CashOut.refusalMessage(undefined), null);
});
