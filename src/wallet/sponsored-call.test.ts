import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bytesToHex } from '@noble/hashes/utils';
import {
  Account,
  Address,
  Asset,
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
  nestedCalls?: xdr.InvokeContractArgs[];
  ids?: number[];
};

function vaultCallArgs(functionName: string, args: xdr.ScVal[]): xdr.InvokeContractArgs {
  return new xdr.InvokeContractArgs({
    contractAddress: new Address(network.usdcVault).toScAddress(),
    functionName,
    args,
  });
}

const withdrawShape: Shape = {
  call: vaultCallArgs('withdraw', [
    nativeToScVal(5n, { type: 'i128' }),
    nativeToScVal([4n], { type: 'i128' }),
    new Address(wallet).toScVal(),
  ]),
};

const depositShape: Shape = {
  call: vaultCallArgs('deposit', [
    nativeToScVal([10n], { type: 'i128' }),
    nativeToScVal([9n], { type: 'i128' }),
    new Address(wallet).toScVal(),
    nativeToScVal(true),
  ]),
  nestedCalls: [
    new xdr.InvokeContractArgs({
      contractAddress: new Address(network.usdc).toScAddress(),
      functionName: 'transfer',
      args: [
        new Address(wallet).toScVal(),
        new Address(network.usdcVault).toScVal(),
        nativeToScVal(10n, { type: 'i128' }),
      ],
    }),
  ],
  ids: [1, 1],
};

function transferArgs(amount: bigint): xdr.InvokeContractArgs {
  return new xdr.InvokeContractArgs({
    contractAddress: new Address(token).toScAddress(),
    functionName: 'transfer',
    args: [new Address(wallet).toScVal(), new Address(network.payee).toScVal(), nativeToScVal(amount, { type: 'i128' })],
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
      subInvocations: shape.nestedCalls
        ? shape.nestedCalls.map(
            (nestedCall) =>
              new xdr.SorobanAuthorizedInvocation({
                function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(nestedCall),
                subInvocations: shape.nested ? [nestedInvocation] : [],
              }),
          )
        : shape.nested
          ? [nestedInvocation]
          : [],
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
    digest: shape.credentials === 'source' ? '00'.repeat(32) : independentDigest(entry, shape.ids ?? ruleIds),
    contextRuleIds: shape.ids ?? ruleIds,
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

test('a one-rule authorization covering nested calls is refused', () => {
  rejects(build({ nested: true }), /nested calls/);
});

test('a vault withdraw verifies with one rule and no nested calls', () => {
  const call = SponsoredCall.verify(build(withdrawShape), wallet, ruleIds, latestLedger);
  assert.equal(call.contract, network.usdcVault);
  assert.equal(call.method, 'withdraw');
  assert.deepEqual(call.nested, []);
});

test('a vault deposit verifies with two rules and exposes its nested transfer', () => {
  const built = build(depositShape);
  const call = SponsoredCall.verify(built, wallet, [1, 1], latestLedger);
  assert.equal(call.contract, network.usdcVault);
  assert.equal(call.method, 'deposit');
  assert.equal(call.args.length, 4);
  assert.equal(call.nested.length, 1);
  assert.equal(call.nested[0].contract, network.usdc);
  assert.equal(call.nested[0].method, 'transfer');
  assert.equal(bytesToHex(call.digest), built.digest);
});

test('a vault deposit naming wallet rules other than [1, 1] is refused', () => {
  for (const contextRuleIds of [[1], [1, 0], [0, 1], [1, 1, 1]]) {
    assert.throws(
      () => SponsoredCall.verify(build(depositShape, { contextRuleIds }), wallet, [1, 1], latestLedger),
      /unexpected wallet rules/,
    );
  }
});

test('a vault deposit verified against one rule is refused', () => {
  rejects(build(depositShape), /nested calls/);
});

test('a two-rule authorization without a nested call is refused', () => {
  assert.throws(() => SponsoredCall.verify(build({ ids: [1, 1] }), wallet, [1, 1], latestLedger), /nested calls/);
});

test('a nested call with its own nested calls is refused', () => {
  assert.throws(
    () => SponsoredCall.verify(build({ ...depositShape, nested: true }), wallet, [1, 1], latestLedger),
    /nested calls inside nested calls/,
  );
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
