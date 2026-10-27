import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { SponsoredResult } from '../ctx/client.ts';
import { CtxError } from '../ctx/ctx-error.ts';
import { PriceWindow } from '../ctx/price-window.ts';
import { Rates } from '../ctx/rates.ts';
import { units } from '../stellar/units.ts';
import { Holdings } from './holdings.ts';
import {
  SavingsTopUp,
  UnansweredWithdrawal,
  type ChainTransaction,
  type PendingWithdrawal,
  type SentWithdrawal,
  type TopUpChain,
} from './savings-top-up.ts';
import type { Balances } from './smart-wallet.ts';

const usdc = { currency: 'XLM.USDC' as const, symbol: 'USDC', contract: 'CUSDC' };
const start = Date.parse('2026-10-26T12:00:00Z');

type Status = 'NOT_FOUND' | 'SUCCESS' | 'FAILED';

type FakeVault = {
  wallet: string;
  shares: string;
  value: string;
  withdrawal?: SponsoredResult;
  statuses?: Status[];
  statusesOf?: Record<string, Status[]>;
  landed?: (shares: bigint, value: bigint) => bigint;
  refusals?: Refusal[];
};

type Refusal = { value: string; status: number; landed?: boolean };

const firstLedger = 1_000;
const ledgerMs = 5_000;
const signatureLedgers = 60;

class FakeChain implements TopUpChain {
  clock = start;
  wallet: bigint;
  shares: bigint;
  value: bigint;
  withdrawn: bigint[] = [];
  sent = new Map<string, bigint>();
  polls = new Map<string, number>();
  polled = 0;
  readsAfterSuccess = 0;
  readonly landedHashes = new Set<string>();
  readonly withdrawal?: SponsoredResult;
  readonly statuses: Status[];
  readonly statusesOf: Record<string, Status[]>;
  readonly landed: (shares: bigint, value: bigint) => bigint;
  readonly refusals: Refusal[];

  constructor(vault: FakeVault) {
    this.wallet = units.parse(vault.wallet);
    this.shares = units.parse(vault.shares);
    this.value = units.parse(vault.value);
    this.withdrawal = vault.withdrawal;
    this.statuses = vault.statuses ?? ['SUCCESS'];
    this.statusesOf = vault.statusesOf ?? {};
    this.landed = vault.landed ?? ((_, value) => Holdings.floorOf(value));
    this.refusals = [...(vault.refusals ?? [])];
  }

  ledger(): number {
    return firstLedger + Math.floor((this.clock - start) / ledgerMs);
  }

  async latestLedger(): Promise<number> {
    return this.ledger();
  }

  pendingSent(shares: string, hash = 'OLD'): PendingWithdrawal {
    this.sent.set(hash, units.parse(shares));
    return { hash, expiryLedger: this.ledger() + signatureLedgers };
  }

  async balances(): Promise<Balances> {
    if (this.landedHashes.size > 0) {
      this.readsAfterSuccess += 1;
    }
    return {
      tokens: [{ token: usdc, amount: this.wallet }],
      vaultShares: this.shares,
      vaultValue: this.value,
    };
  }

  async valueOf(shares: bigint): Promise<bigint> {
    return (shares * this.value) / this.shares;
  }

  async withdraw(shares: bigint): Promise<SentWithdrawal> {
    this.withdrawn.push(shares);
    const expiryLedger = this.ledger() + signatureLedgers;
    const refusal = this.refusals.shift();
    if (refusal) {
      if (refusal.landed) {
        this.wallet += Holdings.floorOf(await this.valueOf(shares));
      }
      this.value = units.parse(refusal.value);
      UnansweredWithdrawal.rethrow(new CtxError(refusal.status, '{"error":"simulation failed"}'), expiryLedger);
    }
    const hash = `HASH-${this.withdrawn.length}`;
    this.sent.set(hash, shares);
    return { ...(this.withdrawal ?? { hash, status: 'pending' }), expiryLedger };
  }

  async transaction(hash: string): Promise<ChainTransaction> {
    const statuses = this.statusesOf[hash] ?? this.statuses;
    const poll = this.polls.get(hash) ?? 0;
    this.polls.set(hash, poll + 1);
    this.polled += 1;
    const status = statuses[Math.min(poll, statuses.length - 1)];
    if (status === 'SUCCESS' && !this.landedHashes.has(hash)) {
      this.landedHashes.add(hash);
      const shares = this.sent.get(hash) ?? 0n;
      this.wallet += this.landed(shares, await this.valueOf(shares));
    }
    return { status, latestLedger: this.ledger() };
  }

  async sleep(ms: number): Promise<void> {
    this.clock += ms;
  }

  now(): number {
    return this.clock;
  }
}

const openWindow = new PriceWindow(start + 600_000);
const price = units.parse('10');

test('the shares withdrawn for a 10.00 shortfall at 100 bp have a floor of at least 10.00, rounding up', async () => {
  const chain = new FakeChain({ wallet: '0', shares: '100', value: '103.3333333' });
  const balances = await chain.balances();
  const shares = await new SavingsTopUp(chain).sharesCovering(price, balances);
  assert.ok(shares !== null);
  assert.ok(Holdings.floorOf(await chain.valueOf(shares)) >= price);
  assert.ok(Holdings.floorOf(await chain.valueOf(shares - 1n)) < price);
  assert.ok(shares - SavingsTopUp.estimatedShares(price, balances.vaultShares, balances.vaultValue) <= 1n);
});

test('the share estimate never exceeds the shares held', () => {
  assert.equal(SavingsTopUp.estimatedShares(price, 5n, units.parse('10.05')), 5n);
});

test('the share value is at most the shortfall over the slippage floor plus one share', () => {
  const vaultShares = units.parse('80');
  const vaultValue = units.parse('100');
  const shares = SavingsTopUp.estimatedShares(price, vaultShares, vaultValue);
  const value = (shares * vaultValue) / vaultShares;
  const shareValue = vaultValue / vaultShares + 1n;
  assert.ok(value <= (price * 10_000n) / (10_000n - Holdings.withdrawSlippageBasisPoints) + shareValue);
});

test('a wallet that covers the price pays with no withdrawal', async () => {
  const chain = new FakeChain({ wallet: '10', shares: '50', value: '50' });
  assert.deepEqual(await new SavingsTopUp(chain).run(price, openWindow), { kind: 'covered' });
  assert.deepEqual(chain.withdrawn, []);
});

test('a short wallet withdraws one slippage floor covering the shortfall, then covers the price', async () => {
  const chain = new FakeChain({ wallet: '4', shares: '40', value: '50' });
  assert.deepEqual(await new SavingsTopUp(chain).run(price, openWindow), { kind: 'covered' });
  assert.equal(chain.withdrawn.length, 1);
  const [shares] = chain.withdrawn;
  assert.ok(shares <= chain.shares);
  assert.ok(Holdings.floorOf(await chain.valueOf(shares)) >= units.parse('6'));
  assert.ok(chain.wallet >= price);
});

test('savings worth 10.05 cannot cover a 10.00 shortfall, 10.11 can', async () => {
  assert.deepEqual(holdingsWith('10.05').coverage('XLM.USDC', price), { kind: 'short' });
  assert.equal(holdingsWith('10.05').spendable('XLM.USDC'), units.parse('9.9495'));
  assert.deepEqual(holdingsWith('10.11').coverage('XLM.USDC', price), { kind: 'savings', fromSavings: price });

  const chain = new FakeChain({ wallet: '0', shares: '10.05', value: '10.05' });
  assert.deepEqual(await new SavingsTopUp(chain).run(price, openWindow), { kind: 'notEnough' });
  assert.deepEqual(chain.withdrawn, []);

  const enough = new FakeChain({ wallet: '0', shares: '10.11', value: '10.11' });
  assert.deepEqual(await new SavingsTopUp(enough).run(price, openWindow), { kind: 'covered' });
  assert.equal(enough.withdrawn.length, 1);
});

test('under 90 seconds left on the price sends no withdrawal', async () => {
  const chain = new FakeChain({ wallet: '0', shares: '50', value: '50' });
  const closing = new PriceWindow(start + 89_999);
  const outcome = await new SavingsTopUp(chain).run(price, closing);
  assert.deepEqual(outcome, { kind: 'priceClosing' });
  assert.equal(SavingsTopUp.message(outcome, 'USDC'), 'This price is about to expire');
  assert.deepEqual(chain.withdrawn, []);
});

test('an order with no price window sends no withdrawal', async () => {
  const chain = new FakeChain({ wallet: '0', shares: '50', value: '50' });
  assert.deepEqual(await new SavingsTopUp(chain).run(price, null), { kind: 'priceClosing' });
  assert.deepEqual(chain.withdrawn, []);
});

test('a withdrawal that succeeds after the price expires is not followed by a payment', async () => {
  const chain = new FakeChain({ wallet: '0', shares: '50', value: '50', statuses: ['NOT_FOUND', 'SUCCESS'] });
  const window = new PriceWindow(start + 90_000 + PriceWindow.closingMs);
  const sleep = chain.sleep.bind(chain);
  chain.sleep = async (ms) => {
    await sleep(ms);
    chain.clock = window.expiresAt;
  };
  assert.deepEqual(await new SavingsTopUp(chain).run(price, window), { kind: 'priceExpired' });
  assert.ok(chain.wallet >= price);
});

test('a withdrawal that lands short of the price is not followed by a payment', async () => {
  const chain = new FakeChain({ wallet: '0', shares: '50', value: '50', landed: () => units.parse('9') });
  const outcome = await new SavingsTopUp(chain).run(price, openWindow);
  assert.deepEqual(outcome, { kind: 'stillShort', moved: units.parse('9') });
  assert.match(SavingsTopUp.message(outcome, 'USDC'), /^Moved \D*9\.00 to your wallet, not enough to pay$/);
});

test('a withdrawal refused at the sponsor is not followed by a payment or a confirmation poll', async () => {
  const chain = new FakeChain({
    wallet: '0',
    shares: '50',
    value: '50',
    withdrawal: { hash: '', status: 'failed', error: 'tx_failed' },
  });
  assert.deepEqual(await new SavingsTopUp(chain).run(price, openWindow), { kind: 'withdrawFailed' });
  assert.equal(chain.polled, 0);
  assert.equal(chain.withdrawn.length, SavingsTopUp.withdrawAttempts);
});

test('a withdrawal refused at the sponsor after a share value change is rebuilt from fresh balances once', async () => {
  const chain = new FakeChain({
    wallet: '0',
    shares: '50',
    value: '50',
    refusals: [{ value: '45', status: 400 }],
  });
  assert.deepEqual(await new SavingsTopUp(chain).run(price, openWindow), { kind: 'covered' });
  assert.equal(chain.withdrawn.length, 2);
  assert.ok(chain.withdrawn[1] > chain.withdrawn[0]);
});

test('a withdrawal refused at the sponsor twice reports a failed withdrawal', async () => {
  const chain = new FakeChain({
    wallet: '0',
    shares: '50',
    value: '50',
    refusals: [
      { value: '50', status: 400 },
      { value: '50', status: 400 },
    ],
  });
  assert.deepEqual(await new SavingsTopUp(chain).run(price, openWindow), { kind: 'withdrawFailed' });
  assert.equal(chain.withdrawn.length, 2);
});

test('a withdrawal whose sponsor call goes unanswered is kept as moving until its signature expires', async () => {
  const chain = new FakeChain({
    wallet: '0',
    shares: '50',
    value: '50',
    refusals: [{ value: '50', status: 504 }],
  });
  const topUp = new SavingsTopUp(chain);
  const first = await topUp.run(price, openWindow);
  const unanswered = { hash: '', expiryLedger: firstLedger + signatureLedgers };
  assert.deepEqual(first, { kind: 'stillMoving', withdrawal: unanswered });
  assert.equal(chain.withdrawn.length, 1);

  assert.deepEqual(await topUp.run(price, openWindow, unanswered), { kind: 'stillMoving', withdrawal: unanswered });
  assert.equal(chain.withdrawn.length, 1);

  chain.clock = start + (signatureLedgers + 1) * ledgerMs;
  const window = new PriceWindow(chain.clock + 600_000);
  assert.deepEqual(await topUp.run(price, window, unanswered), { kind: 'covered' });
  assert.equal(chain.withdrawn.length, 2);
});

test('an unanswered withdrawal that landed covers the retry without a second withdrawal', async () => {
  const chain = new FakeChain({
    wallet: '0',
    shares: '50',
    value: '50',
    refusals: [{ value: '50', status: 504, landed: true }],
  });
  const topUp = new SavingsTopUp(chain);
  const first = await topUp.run(price, openWindow);
  assert.equal(first.kind, 'stillMoving');
  assert.deepEqual(await topUp.run(price, openWindow, first.kind === 'stillMoving' ? first.withdrawal : undefined), {
    kind: 'covered',
    withdrawal: { hash: '', expiryLedger: firstLedger + signatureLedgers },
  });
  assert.equal(chain.withdrawn.length, 1);
});

test('only a 4xx sponsor answer counts as a refusal, anything else leaves the withdrawal unanswered', () => {
  const refused = new CtxError(400, '{"error":"simulation failed"}');
  assert.throws(() => UnansweredWithdrawal.rethrow(refused, 1_060), (error) => error === refused);
  for (const error of [new CtxError(502, ''), new TypeError('Network request failed'), new Error('timeout')]) {
    assert.throws(
      () => UnansweredWithdrawal.rethrow(error, 1_060),
      (thrown) => thrown instanceof UnansweredWithdrawal && thrown.expiryLedger === 1_060 && thrown.cause === error,
    );
  }
});

test('a withdrawal that reached the chain and failed is not rebuilt', async () => {
  const chain = new FakeChain({
    wallet: '0',
    shares: '50',
    value: '50',
    withdrawal: { hash: 'H', status: 'failed', error: 'tx_failed' },
  });
  assert.deepEqual(await new SavingsTopUp(chain).run(price, openWindow), { kind: 'withdrawFailed' });
  assert.equal(chain.withdrawn.length, 1);
});

test('a withdrawal that fails on chain is not followed by a payment', async () => {
  const chain = new FakeChain({ wallet: '0', shares: '50', value: '50', statuses: ['NOT_FOUND', 'FAILED'] });
  assert.deepEqual(await new SavingsTopUp(chain).run(price, openWindow), { kind: 'withdrawFailed' });
  assert.equal(chain.withdrawn.length, 1);
});

test('a withdrawal still pending after 30 seconds stops with its hash and expiry and no payment', async () => {
  const chain = new FakeChain({ wallet: '0', shares: '50', value: '50', statuses: ['NOT_FOUND'] });
  assert.deepEqual(await new SavingsTopUp(chain).run(price, openWindow), {
    kind: 'stillMoving',
    withdrawal: { hash: 'HASH-1', expiryLedger: firstLedger + signatureLedgers },
  });
  assert.equal(chain.clock - start, SavingsTopUp.confirmTimeoutMs);
});

test('a retry with a pending withdrawal that covers the price confirms it and never withdraws again', async () => {
  const chain = new FakeChain({ wallet: '0', shares: '50', value: '50' });
  const pending = chain.pendingSent('11');
  assert.deepEqual(await new SavingsTopUp(chain).run(price, openWindow, pending), { kind: 'covered' });
  assert.deepEqual(chain.withdrawn, []);
});

test('a pending withdrawal from an abandoned order is confirmed before the new shortfall is withdrawn', async () => {
  const chain = new FakeChain({ wallet: '0', shares: '50', value: '50' });
  const pending = chain.pendingSent('6.0606061');
  const outcome = await new SavingsTopUp(chain).run(price, openWindow, pending);
  assert.deepEqual(outcome, { kind: 'covered' });
  assert.equal(chain.withdrawn.length, 1);
  const [shares] = chain.withdrawn;
  assert.ok(Holdings.floorOf(await chain.valueOf(shares)) >= price - units.parse('6'));
  assert.ok(shares < SavingsTopUp.estimatedShares(price, chain.shares, chain.value));
});

test('a pending withdrawal still unconfirmed stops before any new withdrawal', async () => {
  const chain = new FakeChain({ wallet: '0', shares: '50', value: '50', statuses: ['NOT_FOUND'] });
  const pending = chain.pendingSent('11');
  assert.deepEqual(await new SavingsTopUp(chain).run(price, openWindow, pending), {
    kind: 'stillMoving',
    withdrawal: pending,
  });
  assert.deepEqual(chain.withdrawn, []);
});

test('a pending withdrawal does not hold up a payment the wallet already covers', async () => {
  const chain = new FakeChain({ wallet: '20', shares: '50', value: '50', statuses: ['NOT_FOUND'] });
  const pending = chain.pendingSent('11');
  assert.deepEqual(await new SavingsTopUp(chain).run(price, openWindow, pending), {
    kind: 'covered',
    withdrawal: pending,
  });
  assert.equal(chain.polled, 1);
  assert.equal(chain.clock, start);
  assert.deepEqual(chain.withdrawn, []);
});

test('a landed pending withdrawal is dropped when the wallet already covers the price', async () => {
  const chain = new FakeChain({ wallet: '20', shares: '50', value: '50' });
  const pending = chain.pendingSent('11');
  assert.deepEqual(await new SavingsTopUp(chain).run(price, openWindow, pending), { kind: 'covered' });
  assert.deepEqual(chain.withdrawn, []);
});

test('a failed pending withdrawal is dropped when the wallet already covers the price', async () => {
  const chain = new FakeChain({ wallet: '20', shares: '50', value: '50', statuses: ['FAILED'] });
  const pending = chain.pendingSent('11');
  assert.deepEqual(await new SavingsTopUp(chain).run(price, openWindow, pending), { kind: 'covered' });
});

test('a withdrawal not found once its signature has expired counts as failed', () => {
  const pending = { hash: 'OLD', expiryLedger: 1_060 };
  assert.equal(SavingsTopUp.outcomeOf({ status: 'NOT_FOUND', latestLedger: 1_060 }, pending), 'pending');
  assert.equal(SavingsTopUp.outcomeOf({ status: 'NOT_FOUND', latestLedger: 1_061 }, pending), 'failed');
  assert.equal(SavingsTopUp.outcomeOf({ status: 'SUCCESS', latestLedger: 1_061 }, pending), 'success');
  assert.equal(SavingsTopUp.outcomeOf({ status: 'FAILED', latestLedger: 1_000 }, pending), 'failed');
});

test('a dropped pending withdrawal is given up after its expiry and a new one is sent', async () => {
  const chain = new FakeChain({
    wallet: '0',
    shares: '50',
    value: '50',
    statusesOf: { OLD: ['NOT_FOUND'] },
  });
  const pending = chain.pendingSent('11');
  const topUp = new SavingsTopUp(chain);
  assert.equal((await topUp.run(price, openWindow, pending)).kind, 'stillMoving');
  chain.clock = start + (signatureLedgers + 1) * ledgerMs;
  const window = new PriceWindow(chain.clock + 600_000);
  assert.deepEqual(await topUp.run(price, window, pending), { kind: 'covered' });
  assert.equal(chain.withdrawn.length, 1);
  assert.equal(chain.landedHashes.has('OLD'), false);
});

test('the wallet balance is read again only after the withdrawal confirms', async () => {
  const chain = new FakeChain({
    wallet: '0',
    shares: '50',
    value: '50',
    statuses: ['NOT_FOUND', 'NOT_FOUND', 'SUCCESS'],
  });
  await new SavingsTopUp(chain).run(price, openWindow);
  assert.equal(chain.polled, 3);
  assert.equal(chain.readsAfterSuccess, 1);
});

test('a read error while confirming counts as pending', async () => {
  const chain = new FakeChain({ wallet: '0', shares: '50', value: '50' });
  let calls = 0;
  const transaction = chain.transaction.bind(chain);
  chain.transaction = async (hash) => {
    calls += 1;
    if (calls === 1) {
      throw new Error('rpc down');
    }
    return transaction(hash);
  };
  assert.deepEqual(await new SavingsTopUp(chain).run(price, openWindow), { kind: 'covered' });
});

function holdingsWith(vaultValue: string): Holdings {
  const value = units.parse(vaultValue);
  return new Holdings(
    { tokens: [{ token: usdc, amount: 0n }], vaultShares: value, vaultValue: value },
    [],
    Rates.fromPrices({}),
  );
}
