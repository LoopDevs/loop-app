import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { SponsoredResult } from '../ctx/client.ts';
import { PriceWindow } from '../ctx/price-window.ts';
import { Rates } from '../ctx/rates.ts';
import { units } from '../stellar/units.ts';
import { Holdings } from './holdings.ts';
import { SavingsTopUp, type TopUpChain } from './savings-top-up.ts';
import type { Balances } from './smart-wallet.ts';

const usdc = { currency: 'XLM.USDC' as const, symbol: 'USDC', contract: 'CUSDC' };
const start = Date.parse('2026-10-26T12:00:00Z');

type FakeVault = {
  wallet: string;
  shares: string;
  value: string;
  withdrawal?: SponsoredResult;
  statuses?: ('pending' | 'success' | 'failed')[];
  landed?: (shares: bigint, value: bigint) => bigint;
};

class FakeChain implements TopUpChain {
  clock = start;
  wallet: bigint;
  shares: bigint;
  value: bigint;
  withdrawn: bigint[] = [];
  polled = 0;
  readsAfterSuccess = 0;
  succeeded = false;
  readonly withdrawal: SponsoredResult;
  readonly statuses: ('pending' | 'success' | 'failed')[];
  readonly landed: (shares: bigint, value: bigint) => bigint;

  constructor(vault: FakeVault) {
    this.wallet = units.parse(vault.wallet);
    this.shares = units.parse(vault.shares);
    this.value = units.parse(vault.value);
    this.withdrawal = vault.withdrawal ?? { hash: 'HASH', status: 'pending' };
    this.statuses = vault.statuses ?? ['success'];
    this.landed = vault.landed ?? ((_, value) => Holdings.floorOf(value));
  }

  async balances(): Promise<Balances> {
    if (this.succeeded) {
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

  async withdraw(shares: bigint): Promise<SponsoredResult> {
    this.withdrawn.push(shares);
    return this.withdrawal;
  }

  async transactionStatus(): Promise<'pending' | 'success' | 'failed'> {
    const status = this.statuses[Math.min(this.polled, this.statuses.length - 1)];
    this.polled += 1;
    if (status === 'success' && !this.succeeded) {
      this.succeeded = true;
      const shares = this.withdrawn.at(-1) ?? 0n;
      this.wallet += this.landed(shares, await this.valueOf(shares));
    }
    return status;
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
  const chain = new FakeChain({ wallet: '0', shares: '50', value: '50', statuses: ['pending', 'success'] });
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
});

test('a withdrawal that fails on chain is not followed by a payment', async () => {
  const chain = new FakeChain({ wallet: '0', shares: '50', value: '50', statuses: ['pending', 'failed'] });
  assert.deepEqual(await new SavingsTopUp(chain).run(price, openWindow), { kind: 'withdrawFailed' });
  assert.equal(chain.withdrawn.length, 1);
});

test('a withdrawal still pending after 30 seconds stops with its hash and no payment', async () => {
  const chain = new FakeChain({ wallet: '0', shares: '50', value: '50', statuses: ['pending'] });
  assert.deepEqual(await new SavingsTopUp(chain).run(price, openWindow), { kind: 'stillMoving', hash: 'HASH' });
  assert.equal(chain.clock - start, SavingsTopUp.confirmTimeoutMs);
});

test('a retry with a pending withdrawal confirms it and never withdraws again', async () => {
  const chain = new FakeChain({ wallet: '0', shares: '50', value: '50' });
  chain.withdrawn.push(units.parse('11'));
  assert.deepEqual(await new SavingsTopUp(chain).run(price, openWindow, 'HASH'), { kind: 'covered' });
  assert.equal(chain.withdrawn.length, 1);
});

test('the wallet balance is read again only after the withdrawal confirms', async () => {
  const chain = new FakeChain({ wallet: '0', shares: '50', value: '50', statuses: ['pending', 'pending', 'success'] });
  await new SavingsTopUp(chain).run(price, openWindow);
  assert.equal(chain.polled, 3);
  assert.equal(chain.readsAfterSuccess, 1);
});

test('a read error while confirming counts as pending', async () => {
  const chain = new FakeChain({ wallet: '0', shares: '50', value: '50' });
  let calls = 0;
  const status = chain.transactionStatus.bind(chain);
  chain.transactionStatus = async () => {
    calls += 1;
    if (calls === 1) {
      throw new Error('rpc down');
    }
    return status();
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
