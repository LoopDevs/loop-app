import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Address, StrKey, nativeToScVal, type xdr } from '@stellar/stellar-sdk';

import { money } from '../money.ts';
import { network } from '../stellar/network.ts';
import { units } from '../stellar/units.ts';
import { CtxError } from '../ctx/ctx-error.ts';
import { Savings, SponsorReplyLost } from './savings.ts';
import type { AuthorizedCall, ContractCall } from './sponsored-call.ts';
import { VaultCall, type SentVaultCall } from './vault-call.ts';

const wallet = StrKey.encodeContract(Buffer.alloc(32, 1));
const stranger = StrKey.encodeContract(Buffer.alloc(32, 3));
const amount = units.parse('12.5');

function address(value: string): xdr.ScVal {
  return new Address(value).toScVal();
}

function amounts(values: bigint[]): xdr.ScVal {
  return nativeToScVal(values, { type: 'i128' });
}

function transfer(shape: { to?: string; amount?: bigint } = {}): ContractCall {
  return {
    contract: network.usdc,
    method: 'transfer',
    args: [address(wallet), address(shape.to ?? network.usdcVault), nativeToScVal(shape.amount ?? amount, { type: 'i128' })],
  };
}

type DepositShape = {
  vault?: string;
  method?: string;
  desired?: bigint[];
  minimums?: bigint[];
  from?: string;
  invest?: boolean;
  nested?: ContractCall[];
};

function deposit(shape: DepositShape = {}): AuthorizedCall {
  return {
    contract: shape.vault ?? network.usdcVault,
    method: shape.method ?? 'deposit',
    args: [
      amounts(shape.desired ?? [amount]),
      amounts(shape.minimums ?? [amount - 1n]),
      address(shape.from ?? wallet),
      nativeToScVal(shape.invest ?? true),
    ],
    nested: shape.nested ?? [transfer()],
  };
}

function rejects(call: AuthorizedCall): void {
  assert.throws(() => Savings.requireDeposit(call, wallet, amount));
}

test('savings takes its own vault currency', () => {
  assert.equal(Savings.takes(Savings.currency), true);
});

test('savings takes no other currency', () => {
  for (const currency of ['XLM.GBPLOOP', 'XLM.EURC', 'XLM', '', undefined]) {
    assert.equal(Savings.takes(currency), false, String(currency));
  }
});

test('a deposit of the amount from this wallet into the savings vault is accepted', () => {
  assert.doesNotThrow(() => Savings.requireDeposit(deposit(), wallet, amount));
  assert.doesNotThrow(() => Savings.requireDeposit(deposit({ minimums: [amount] }), wallet, amount));
});

test('a deposit into another contract is refused', () => {
  rejects(deposit({ vault: stranger }));
});

test('a vault call other than deposit is refused', () => {
  rejects(deposit({ method: 'withdraw' }));
});

test('a deposit whose desired amounts differ from the amount is refused', () => {
  rejects(deposit({ desired: [amount + 1n] }));
  rejects(deposit({ desired: [amount, amount] }));
  rejects(deposit({ desired: [] }));
});

test('a deposit whose minimum is above the amount is refused', () => {
  rejects(deposit({ minimums: [amount + 1n] }));
  rejects(deposit({ minimums: [] }));
});

test('a deposit from another address is refused', () => {
  rejects(deposit({ from: stranger }));
});

test('a deposit that does not invest is refused', () => {
  rejects(deposit({ invest: false }));
});

test('a deposit without its nested transfer is refused', () => {
  rejects(deposit({ nested: [] }));
});

test('a deposit whose transfer goes to an address other than the vault is refused', () => {
  rejects(deposit({ nested: [transfer({ to: stranger })] }));
});

test('a deposit whose transfer moves a different amount is refused', () => {
  rejects(deposit({ nested: [transfer({ amount: amount + 1n })] }));
});

test('a deposit with a second nested call is refused', () => {
  rejects(deposit({ nested: [transfer(), transfer()] }));
});

test('the deposit intent carries the exact seven-decimal amount', () => {
  const max = units.parse('12.3456789');
  const typed = Savings.depositAmount(units.format(max, units.decimals), max);
  assert.equal(typed, max);
  assert.deepEqual(Savings.depositIntent(max), {
    intent: 'vault_deposit',
    currency: 'XLM.USDC',
    amount: '12.3456789',
  });
  assert.equal(Savings.depositIntent(units.parse('1')).amount, '1.0000000');
});

test('a deposit amount must be a positive amount within the wallet USDC', () => {
  const walletUsdc = units.parse('5');
  assert.equal(Savings.depositAmount('5', walletUsdc), walletUsdc);
  assert.equal(Savings.depositAmount('2,5', walletUsdc), units.parse('2.5'));
  assert.equal(Savings.depositAmount('0', walletUsdc), null);
  assert.equal(Savings.depositAmount('', walletUsdc), null);
  assert.equal(Savings.depositAmount('abc', walletUsdc), null);
  assert.equal(Savings.depositAmount('1.12345678', walletUsdc), null);
  assert.equal(Savings.depositAmount('5.0000001', walletUsdc), null);
});

test('each deposit outcome has its own message', () => {
  assert.equal(Savings.depositMessage('success', units.parse('25')), `Added ${money.token(units.parse('25'), Savings.currency)} to savings`);
  assert.equal(
    Savings.depositMessage('failed', units.parse('1')),
    'The deposit failed. Your money is still in your balance.',
  );
  assert.equal(Savings.depositMessage('pending', units.parse('1')), 'Still confirming. Check back in a minute.');
  assert.match(Savings.depositMessage('unconfirmed', units.parse('1')), /may still be confirming/);
});

function depositRun(send: () => Promise<SentVaultCall>) {
  const events: string[] = [];
  const vaultCall = new VaultCall({
    transaction: async () => ({ status: 'SUCCESS', latestLedger: 1 }),
    sleep: async () => {},
    now: () => 0,
  });
  const result = Savings.sendDeposit(send, vaultCall, {
    clear: () => events.push('clear'),
    restore: () => events.push('restore'),
  });
  return { result, events };
}

test('a deposit refused before it is sent keeps the amount in the field', async () => {
  const { result, events } = depositRun(async () => {
    throw new Error('Savings are unavailable');
  });
  await assert.rejects(result, /Savings are unavailable/);
  assert.deepEqual(events, []);
});

test('a deposit the sponsor accepts clears the field and keeps it clear once it lands', async () => {
  const { result, events } = depositRun(async () => ({ hash: 'HASH', status: 'pending', expiryLedger: 10 }));
  assert.equal((await result).outcome, 'success');
  assert.deepEqual(events, ['clear']);
});

test('a deposit that fails after it is sent puts the amount back in the field', async () => {
  const { result, events } = depositRun(async () => ({ hash: '', status: 'failed', expiryLedger: 10 }));
  assert.equal((await result).outcome, 'failed');
  assert.deepEqual(events, ['clear', 'restore']);
});

test('a lost sponsor reply clears the field and reports the deposit as unconfirmed', async () => {
  const { result, events } = depositRun(async () => {
    throw new SponsorReplyLost();
  });
  assert.equal((await result).outcome, 'unconfirmed');
  assert.deepEqual(events, ['clear']);
});

test('only a reply-less sponsor failure is treated as possibly landed', () => {
  const refusal = new CtxError(400, '{"error":"ErrSavingsUnavailable"}');
  assert.equal(Savings.sponsorFailure(refusal), refusal);
  const lost = Savings.sponsorFailure(new TypeError('Network request failed'));
  assert.ok(lost instanceof SponsorReplyLost);
});

test('Max shows two decimals without rounding up and deposits the exact balance', () => {
  const balance = units.parse('12.3456789');
  assert.equal(Savings.maxInput(balance), '12.34');
  assert.equal(Savings.depositAmount('12.34', balance, true), balance);
  assert.equal(Savings.depositAmount('12.34', balance), units.parse('12.34'));
  assert.equal(Savings.depositAmount('', 0n, true), null);
});
