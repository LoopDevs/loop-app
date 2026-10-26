import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Address, StrKey, nativeToScVal, type xdr } from '@stellar/stellar-sdk';

import { network } from '../stellar/network.ts';
import { units } from '../stellar/units.ts';
import { Savings } from './savings.ts';
import type { AuthorizedCall, ContractCall } from './sponsored-call.ts';

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
  assert.equal(Savings.depositMessage('success', units.parse('1'), 'HASH'), 'Added 1.00 USDC to savings');
  assert.equal(
    Savings.depositMessage('failed', units.parse('1'), ''),
    'The deposit failed. Your USDC is still in your wallet.',
  );
  assert.equal(Savings.depositMessage('pending', units.parse('1'), 'HASH'), 'Deposit sent, still confirming.\nHASH');
});
