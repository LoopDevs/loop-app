import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CtxError } from '../ctx/ctx-error.ts';
import type { Token } from '../stellar/network.ts';
import { units } from '../stellar/units.ts';
import type { Balances } from '../wallet/smart-wallet.ts';
import { AccountDeletion, WalletFunds, type AccountDeletionDeps } from './account-deletion.ts';
import { FavouriteIds } from './favourite-ids.ts';

const usdc: Token = { currency: 'XLM.USDC', symbol: 'USDC', contract: 'CUSDC' };
const eurc: Token = { currency: 'XLM.EURC', symbol: 'EURC', contract: 'CEURC' };

function balances({ usdcAmount = '0', eurcAmount = '0', shares = 0n, savings = '0' } = {}): Balances {
  return {
    tokens: [
      { token: usdc, amount: units.parse(usdcAmount) },
      { token: eurc, amount: units.parse(eurcAmount) },
    ],
    vaultShares: shares,
    vaultValue: units.parse(savings),
  };
}

const link = (address: string, overrides: Partial<{ sponsored: boolean; chain: string; status: string }> = {}) => ({
  id: address,
  address,
  chain: 'XLM',
  sponsored: true,
  status: 'active',
  ...overrides,
});

const funds = (...wallets: [string, Balances][]) =>
  new WalletFunds(wallets.map(([address, held]) => ({ address, balances: held })));

test('the wallet check reads every sponsored active Stellar wallet and skips other links', async () => {
  const read: string[] = [];
  const checked = await WalletFunds.check(
    [link('CA'), link('CB', { sponsored: false }), link('CC', { chain: 'ETH' }), link('CD', { status: 'inactive' }), link('CE')],
    async (address) => {
      read.push(address);
      return balances();
    },
  );
  assert.deepEqual(read, ['CA', 'CE']);
  assert.deepEqual(
    checked.wallets.map(({ address }) => address),
    ['CA', 'CE'],
  );
  assert.equal(checked.isEmpty(), true);
});

test('a failed balance read rejects the wallet check instead of counting as zero', async () => {
  await assert.rejects(
    WalletFunds.check([link('CA'), link('CB')], async (address) => {
      if (address === 'CB') {
        throw new Error('rpc down');
      }
      return balances();
    }),
    /rpc down/,
  );
});

test('the acknowledgment names each amount left, savings included, at full precision', () => {
  const held = funds(
    ['CA', balances({ usdcAmount: '12.4', savings: '3.0000001', shares: 5n })],
    ['CB', balances({ eurcAmount: '0.0000001' })],
    ['CC', balances()],
  );
  assert.equal(held.isEmpty(), false);
  assert.deepEqual(
    held.funded().map(({ address }) => address),
    ['CA', 'CB'],
  );
  assert.equal(
    held.acknowledgment(),
    "I understand I lose 12.40 USDC, 3.0000001 USDC in savings and 0.0000001 EURC. After deletion I can't reach the money left in my wallet, and Loop can't recover it.",
  );
});

test('funds exceed the acknowledgment only when an amount rises above what was acknowledged', () => {
  const acknowledged = funds(['CA', balances({ usdcAmount: '12.4', shares: 5n })]);
  assert.equal(funds(['CA', balances({ usdcAmount: '12.4', shares: 5n })]).exceeds(acknowledged), false);
  assert.equal(funds(['CA', balances({ usdcAmount: '1', shares: 0n })]).exceeds(acknowledged), false);
  assert.equal(funds(['CA', balances({ usdcAmount: '12.4000001', shares: 5n })]).exceeds(acknowledged), true);
  assert.equal(funds(['CA', balances({ usdcAmount: '12.4', shares: 6n })]).exceeds(acknowledged), true);
  assert.equal(funds(['CA', balances({ usdcAmount: '12.4', eurcAmount: '1', shares: 5n })]).exceeds(acknowledged), true);
  assert.equal(funds(['CB', balances({ usdcAmount: '1' })]).exceeds(acknowledged), true);
  assert.equal(funds(['CA', balances({ usdcAmount: '0.0000001' })]).exceeds(WalletFunds.none), true);
  assert.equal(funds(['CA', balances()]).exceeds(WalletFunds.none), false);
});

function harness(overrides: Partial<AccountDeletionDeps> = {}) {
  const calls: string[] = [];
  const erasedWith: string[] = [];
  const removed: string[] = [];
  const deps: AccountDeletionDeps = {
    userId: async () => 'user-1',
    funds: async () => WalletFunds.none,
    erase: async (code) => {
      calls.push('erase');
      erasedWith.push(code);
    },
    removeItem: async (key) => {
      calls.push('removeItem');
      removed.push(key);
    },
    clearSession: async () => {
      calls.push('clearSession');
    },
    ...overrides,
  };
  return { deletion: new AccountDeletion(deps), calls, erasedWith, removed };
}

const ctxError = (status: number, body: unknown) => new CtxError(status, JSON.stringify(body));

test('a zero-balance erase sends the typed code, then clears favourites and the session', async () => {
  const { deletion, calls, erasedWith, removed } = harness();
  assert.deepEqual(await deletion.erase('123456', WalletFunds.none), { kind: 'erased' });
  assert.deepEqual(erasedWith, ['123456']);
  assert.deepEqual(removed, [FavouriteIds.storageKey('user-1')]);
  assert.deepEqual(calls, ['erase', 'removeItem', 'clearSession']);
});

test('the session is cleared after an erase even when favourites fail to clear', async () => {
  const { deletion, calls } = harness({
    removeItem: async () => {
      throw new Error('storage full');
    },
  });
  await assert.rejects(deletion.erase('123456', WalletFunds.none), /storage full/);
  assert.deepEqual(calls, ['erase', 'clearSession']);
});

test('a balance above the acknowledgment returns to the wallet check without sending erase', async () => {
  const acknowledged = funds(['CA', balances({ usdcAmount: '12.4' })]);
  const { deletion, calls } = harness({
    funds: async () => funds(['CA', balances({ usdcAmount: '15' })]),
  });
  assert.deepEqual(await deletion.erase('123456', acknowledged), { kind: 'funds-changed' });
  assert.deepEqual(calls, []);
});

test('funds that appear when nothing was acknowledged return to the wallet check', async () => {
  const { deletion, calls } = harness({
    funds: async () => funds(['CA', balances({ savings: '1', shares: 1n })]),
  });
  assert.deepEqual(await deletion.erase('123456', WalletFunds.none), { kind: 'funds-changed' });
  assert.deepEqual(calls, []);
});

test('a failed balance re-read never sends erase', async () => {
  const { deletion, calls } = harness({
    funds: async () => {
      throw new Error('rpc down');
    },
  });
  assert.deepEqual(await deletion.erase('123456', WalletFunds.none), {
    kind: 'failed',
    message: WalletFunds.unreadableMessage,
  });
  assert.deepEqual(calls, []);
});

test('refused erases keep local data and the session', async () => {
  const refusals: [Error, unknown][] = [
    [ctxError(400, { error: 'ErrInvalidCode' }), { kind: 'invalid-code' }],
    [ctxError(429, { error: 'Err2FATooManyAttempts' }), { kind: 'too-many-attempts' }],
    [
      ctxError(409, {
        error: 'ErrUserEraseBlocked',
        reasons: [{ code: 'order_open' }, { code: 'balance_remaining', currency: 'EUR' }],
      }),
      { kind: 'blocked', reasons: [{ code: 'order_open' }, { code: 'balance_remaining', currency: 'EUR' }] },
    ],
    [new Error('offline'), { kind: 'failed', message: 'offline' }],
  ];
  for (const [error, expected] of refusals) {
    const { deletion, calls } = harness({
      erase: async () => {
        calls.push('erase');
        throw error;
      },
    });
    assert.deepEqual(await deletion.erase('000000', WalletFunds.none), expected);
    assert.deepEqual(calls, ['erase']);
  }
});

test('an unrecognised CTX error is a plain failure', () => {
  const result = AccountDeletion.refusalOf(ctxError(500, { error: 'ErrServerError' }));
  assert.equal(result.kind, 'failed');
  assert.equal(AccountDeletion.refusalOf(ctxError(429, {})).kind, 'failed');
});

test('each erase reason has its message and unknown codes fall back', () => {
  const codes = [
    'account_restricted',
    'order_open',
    'refund_owed',
    'settlement_pending',
    'cashback_pending',
    'payout_in_flight',
    'payout_failed',
    'exchange_pending',
  ];
  const messages = codes.map((code) => AccountDeletion.reasonMessage({ code }));
  assert.equal(new Set(messages).size, codes.length);
  assert.ok(messages.every((message) => message !== AccountDeletion.unknownReasonMessage));
  assert.equal(AccountDeletion.reasonMessage({ code: 'account_restricted' }), 'Your account is restricted. Contact support.');
  assert.equal(
    AccountDeletion.reasonMessage({ code: 'balance_remaining', currency: 'GBP' }),
    'You still have a Loop balance in GBP. Contact support to have it paid out before you delete your account.',
  );
  assert.equal(AccountDeletion.reasonMessage({ code: 'something_new' }), AccountDeletion.unknownReasonMessage);
});

test('a new code can be asked for 20 minutes after the last one was sent', () => {
  assert.equal(AccountDeletion.newCodeAt(1_000), 1_000 + 20 * 60 * 1000);
});
