import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bytesToHex } from '@noble/hashes/utils';
import {
  Account,
  Address,
  Asset,
  MuxedAccount,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
  buildAuthorizationEntryPreimage,
  hash,
  nativeToScVal,
  xdr,
} from '@stellar/stellar-sdk';

import type { BuiltTransaction } from '../ctx/client.ts';
import { network } from '../stellar/network.ts';
import { SponsoredCall } from './sponsored-call.ts';

const wallet = StrKey.encodeContract(Buffer.alloc(32, 1));
const otherWallet = StrKey.encodeContract(Buffer.alloc(32, 2));
const token = network.tokens[1].contract;
const source = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const latestLedger = 1_000;
const expiry = latestLedger + 60;
const ruleIds = [1];

type Shape = {
  amount?: bigint;
  txAmount?: bigint;
  signer?: string;
  credentials?: 'address' | 'source';
  authFunction?: 'contract' | 'create';
  nested?: boolean;
  authCount?: number;
  extraOperation?: boolean;
  payment?: boolean;
  call?: xdr.InvokeContractArgs;
};

function transferArgs(amount: bigint, to: string = network.payee): xdr.InvokeContractArgs {
  return new xdr.InvokeContractArgs({
    contractAddress: new Address(token).toScAddress(),
    functionName: 'transfer',
    args: [new Address(wallet).toScVal(), new Address(to).toScVal(), nativeToScVal(amount, { type: 'i128' })],
  });
}

function authEntry(shape: Shape): xdr.SorobanAuthorizationEntry {
  const call = shape.call ?? transferArgs(shape.amount ?? 10n);
  const fn =
    shape.authFunction === 'create'
      ? xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeCreateContractHostFn(
          new xdr.CreateContractArgs({
            contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAsset(Asset.native().toXDRObject()),
            executable: xdr.ContractExecutable.contractExecutableStellarAsset(),
          }),
        )
      : xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(call);
  const nestedInvocation = new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(call),
    subInvocations: [],
  });
  const credentials =
    shape.credentials === 'source'
      ? xdr.SorobanCredentials.sorobanCredentialsSourceAccount()
      : xdr.SorobanCredentials.sorobanCredentialsAddress(
          new xdr.SorobanAddressCredentials({
            address: new Address(shape.signer ?? wallet).toScAddress(),
            nonce: xdr.Int64.fromString('7'),
            signatureExpirationLedger: expiry,
            signature: xdr.ScVal.scvVoid(),
          }),
        );
  return new xdr.SorobanAuthorizationEntry({
    credentials,
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: fn,
      subInvocations: shape.nested ? [nestedInvocation] : [],
    }),
  });
}

function independentDigest(entry: xdr.SorobanAuthorizationEntry, ids: number[]): string {
  const payload = hash(buildAuthorizationEntryPreimage(entry, expiry, network.passphrase).toXDR());
  const preimage = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('account'), val: new Address(wallet).toScVal() }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('context_rule_ids'),
      val: xdr.ScVal.scvVec(ids.map((id) => xdr.ScVal.scvU32(id))),
    }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('signature_payload'), val: xdr.ScVal.scvBytes(payload) }),
  ]);
  return bytesToHex(hash(preimage.toXDR()));
}

function build(shape: Shape = {}, overrides: Partial<BuiltTransaction> = {}): BuiltTransaction {
  const entry = authEntry(shape);
  const auth = Array.from({ length: shape.authCount ?? 1 }, () => entry);
  const builder = new TransactionBuilder(new Account(source, '1'), {
    fee: '100',
    networkPassphrase: network.passphrase,
  });
  if (shape.payment) {
    builder.addOperation(Operation.payment({ destination: network.payee, asset: Asset.native(), amount: '1' }));
  } else {
    builder.addOperation(
      Operation.invokeHostFunction({
        func: xdr.HostFunction.hostFunctionTypeInvokeContract(
          shape.call ?? transferArgs(shape.txAmount ?? shape.amount ?? 10n),
        ),
        auth,
      }),
    );
  }
  if (shape.extraOperation) {
    builder.addOperation(Operation.payment({ destination: network.payee, asset: Asset.native(), amount: '1' }));
  }
  const transaction = builder.setTimeout(30).build().toXDR();
  return {
    transaction,
    digest: shape.credentials === 'source' ? '00'.repeat(32) : independentDigest(entry, ruleIds),
    contextRuleIds: ruleIds,
    expiryLedger: expiry,
    ...overrides,
  };
}

function rejects(built: BuiltTransaction, message: RegExp, latest = latestLedger): void {
  assert.throws(() => SponsoredCall.verify(built, wallet, ruleIds, latest), message);
}

test('a well-formed sponsored transfer verifies to the digest computed independently', () => {
  const built = build();
  const call = SponsoredCall.verify(built, wallet, ruleIds, latestLedger);
  assert.equal(call.contract, token);
  assert.equal(call.method, 'transfer');
  assert.equal(call.args.length, 3);
  assert.equal(bytesToHex(call.digest), built.digest);
});

test('the testnet digest is pinned to a known vector', { skip: network.passphrase !== Networks.TESTNET }, () => {
  const call = SponsoredCall.verify(build(), wallet, ruleIds, latestLedger);
  assert.equal(bytesToHex(call.digest), '294da97bf121422755e26aa747a8bf151ed3b1b1bbf22788f6091028972c84c5');
});

test('a transaction with more than one operation is refused', () => {
  rejects(build({ extraOperation: true }), /exactly one operation/);
});

test('a transaction that does not invoke a contract is refused', () => {
  rejects(build({ payment: true }), /must invoke a contract/);
});

test('a transaction without exactly one authorization is refused', () => {
  rejects(build({ authCount: 0 }), /exactly one authorization/);
  rejects(build({ authCount: 2 }), /exactly one authorization/);
});

test('an authorization not signed by an address is refused', () => {
  rejects(build({ credentials: 'source' }), /signed by an address/);
});

test('an authorization for another wallet is refused', () => {
  rejects(build({ signer: otherWallet }), /different wallet/);
});

test('an authorization covering nested calls is refused', () => {
  rejects(build({ nested: true }), /nested calls/);
});

test('an authorization that is not a contract call is refused', () => {
  rejects(build({ authFunction: 'create' }), /cover a contract call/);
});

test('an authorization that differs from the transaction call is refused', () => {
  rejects(build({ amount: 10n, txAmount: 11n }), /does not match the transaction call/);
});

test('an expiry that differs from the signed authorization is refused', () => {
  rejects(build({}, { expiryLedger: expiry + 1 }), /expiry does not match/);
});

test('an expiry already passed or beyond the signing window is refused', () => {
  rejects(build(), /signing window/, expiry);
  rejects(build(), /signing window/, expiry - SponsoredCall.maxExpiryLedgers - 1);
  assert.doesNotThrow(() => SponsoredCall.verify(build(), wallet, ruleIds, expiry - SponsoredCall.maxExpiryLedgers));
});

test('unexpected wallet rules are refused', () => {
  rejects(build({}, { contextRuleIds: [0] }), /unexpected wallet rules/);
  rejects(build({}, { contextRuleIds: [1, 0] }), /unexpected wallet rules/);
});

test('a digest that does not match the transaction is refused', () => {
  rejects(build({}, { digest: independentDigest(authEntry({}), [0]) }), /digest to sign does not match/);
  rejects(build({}, { digest: '00'.repeat(32) }), /digest to sign does not match/);
});

const payToken = network.tokens[1];
const orderAddress = new MuxedAccount(new Account(network.payee, '0'), '7').accountId();
const otherOrderAddress = new MuxedAccount(new Account(network.payee, '0'), '8').accountId();

function verified(call: xdr.InvokeContractArgs): SponsoredCall {
  return SponsoredCall.verify(build({ call }), wallet, ruleIds, latestLedger);
}

test('a payment to the order address returns its amount and muxed id', () => {
  const call = verified(transferArgs(25n, orderAddress));
  assert.deepEqual(call.requirePayment({ from: wallet, token: payToken, amount: 25n, orderAddress }), {
    amount: 25n,
    muxedId: 7n,
  });
});

test('a payment to another order of the same payee is refused', () => {
  const call = verified(transferArgs(25n, otherOrderAddress));
  assert.throws(
    () => call.requirePayment({ from: wallet, token: payToken, amount: 25n, orderAddress }),
    /different order/,
  );
});

test('a payment to an account other than the payee is refused', () => {
  const call = verified(transferArgs(25n, source));
  assert.throws(
    () => call.requirePayment({ from: wallet, token: payToken, amount: 25n, orderAddress }),
    /unexpected address/,
  );
});

test('a payment for a different amount is refused', () => {
  const call = verified(transferArgs(26n, orderAddress));
  assert.throws(
    () => call.requirePayment({ from: wallet, token: payToken, amount: 25n, orderAddress }),
    /amount does not match/,
  );
});

test('a payment from another wallet is refused', () => {
  const call = verified(transferArgs(25n, orderAddress));
  assert.throws(
    () => call.requirePayment({ from: otherWallet, token: payToken, amount: 25n, orderAddress }),
    /unexpected address/,
  );
});

test('a payment in a different token is refused', () => {
  const call = verified(transferArgs(25n, orderAddress));
  assert.throws(
    () => call.requirePayment({ from: wallet, token: network.tokens[0], amount: 25n, orderAddress }),
    /is not a/,
  );
});

function withdrawArgs(contract: string, shares: bigint, minimums: bigint[], owner: string): xdr.InvokeContractArgs {
  return new xdr.InvokeContractArgs({
    contractAddress: new Address(contract).toScAddress(),
    functionName: 'withdraw',
    args: [
      nativeToScVal(shares, { type: 'i128' }),
      xdr.ScVal.scvVec(minimums.map((minimum) => nativeToScVal(minimum, { type: 'i128' }))),
      new Address(owner).toScVal(),
    ],
  });
}

const expectedWithdrawal = { from: wallet, vault: network.usdcVault, shares: 40n };

test('a matching withdrawal returns its minimum', () => {
  const call = verified(withdrawArgs(network.usdcVault, 40n, [39n], wallet));
  assert.equal(call.requireWithdrawal(expectedWithdrawal), 39n);
});

test('a withdrawal from another contract, of other shares or for another owner is refused', () => {
  assert.throws(
    () => verified(withdrawArgs(token, 40n, [39n], wallet)).requireWithdrawal(expectedWithdrawal),
    /not a withdrawal/,
  );
  assert.throws(
    () => verified(withdrawArgs(network.usdcVault, 41n, [39n], wallet)).requireWithdrawal(expectedWithdrawal),
    /does not match/,
  );
  assert.throws(
    () => verified(withdrawArgs(network.usdcVault, 40n, [39n], otherWallet)).requireWithdrawal(expectedWithdrawal),
    /does not match/,
  );
  assert.throws(
    () => verified(withdrawArgs(network.usdcVault, 40n, [39n, 1n], wallet)).requireWithdrawal(expectedWithdrawal),
    /does not match/,
  );
});

test('a payment is refused when the order has no address or names another one', () => {
  const muxed = verified(transferArgs(25n, orderAddress));
  assert.throws(
    () => muxed.requirePayment({ from: wallet, token: payToken, amount: 25n, orderAddress: undefined }),
    /different order/,
  );
  assert.throws(
    () => muxed.requirePayment({ from: wallet, token: payToken, amount: 25n, orderAddress: network.payee }),
    /different order/,
  );
  const plain = verified(transferArgs(25n));
  assert.throws(
    () => plain.requirePayment({ from: wallet, token: payToken, amount: 25n, orderAddress }),
    /different order/,
  );
});

test('a transfer amount that is not an i128 is refused', () => {
  const call = verified(
    new xdr.InvokeContractArgs({
      contractAddress: new Address(token).toScAddress(),
      functionName: 'transfer',
      args: [new Address(wallet).toScVal(), new Address(orderAddress).toScVal(), nativeToScVal(25n, { type: 'u64' })],
    }),
  );
  assert.throws(
    () => call.requirePayment({ from: wallet, token: payToken, amount: 25n, orderAddress }),
    /is not a/,
  );
});

test('withdrawal minimums that are not i128 values are refused', () => {
  const call = verified(withdrawArgs(network.usdcVault, 40n, [], wallet));
  const stringMinimum = verified(
    new xdr.InvokeContractArgs({
      contractAddress: new Address(network.usdcVault).toScAddress(),
      functionName: 'withdraw',
      args: [
        nativeToScVal(40n, { type: 'i128' }),
        xdr.ScVal.scvVec([xdr.ScVal.scvString('z')]),
        new Address(wallet).toScVal(),
      ],
    }),
  );
  assert.throws(() => call.requireWithdrawal(expectedWithdrawal), /does not match/);
  assert.throws(() => stringMinimum.requireWithdrawal(expectedWithdrawal), /not a withdrawal/);
});
