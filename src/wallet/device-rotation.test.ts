import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bytesToHex } from '@noble/hashes/utils';
import {
  Account,
  Address,
  Operation,
  StrKey,
  TransactionBuilder,
  buildAuthorizationEntryPreimage,
  hash,
  xdr,
} from '@stellar/stellar-sdk';

import type { BuiltTransaction } from '../ctx/client.ts';
import { network } from '../stellar/network.ts';
import { DeviceRotation } from './device-rotation.ts';
import { SponsoredCall } from './sponsored-call.ts';

const wallet = StrKey.encodeContract(Buffer.alloc(32, 1));
const otherWallet = StrKey.encodeContract(Buffer.alloc(32, 2));
const source = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const latestLedger = 1_000;
const expiry = latestLedger + 60;
const passkeyRule = [0];
const newKey = new Uint8Array(32).fill(7);
const otherKey = new Uint8Array(32).fill(8);

type Shape = {
  contract?: string;
  method?: string;
  args?: xdr.ScVal[];
};

function digestOf(entry: xdr.SorobanAuthorizationEntry): string {
  const payload = hash(buildAuthorizationEntryPreimage(entry, expiry, network.passphrase).toXDR());
  const preimage = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('account'), val: new Address(wallet).toScVal() }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('context_rule_ids'),
      val: xdr.ScVal.scvVec(passkeyRule.map((id) => xdr.ScVal.scvU32(id))),
    }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('signature_payload'), val: xdr.ScVal.scvBytes(payload) }),
  ]);
  return bytesToHex(hash(preimage.toXDR()));
}

function rotation(shape: Shape = {}): SponsoredCall {
  const call = new xdr.InvokeContractArgs({
    contractAddress: new Address(shape.contract ?? wallet).toScAddress(),
    functionName: shape.method ?? 'rotate_device',
    args: shape.args ?? [xdr.ScVal.scvBytes(Buffer.from(newKey))],
  });
  const entry = new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: new Address(wallet).toScAddress(),
        nonce: xdr.Int64.fromString('7'),
        signatureExpirationLedger: expiry,
        signature: xdr.ScVal.scvVoid(),
      }),
    ),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(call),
      subInvocations: [],
    }),
  });
  const transaction = new TransactionBuilder(new Account(source, '1'), {
    fee: '100',
    networkPassphrase: network.passphrase,
  })
    .addOperation(
      Operation.invokeHostFunction({
        func: xdr.HostFunction.hostFunctionTypeInvokeContract(call),
        auth: [entry],
      }),
    )
    .setTimeout(30)
    .build()
    .toXDR();
  const built: BuiltTransaction = {
    transaction,
    digest: digestOf(entry),
    contextRuleIds: passkeyRule,
    expiryLedger: expiry,
  };
  return SponsoredCall.verify(built, wallet, passkeyRule, latestLedger);
}

test('a rotation of this wallet to the new device key is accepted', () => {
  assert.doesNotThrow(() => DeviceRotation.require(rotation(), wallet, newKey));
});

test('a rotation to a different key is refused', () => {
  assert.throws(() => DeviceRotation.require(rotation(), wallet, otherKey), /different key/);
  const rotationToOther = rotation({ args: [xdr.ScVal.scvBytes(Buffer.from(otherKey))] });
  assert.throws(() => DeviceRotation.require(rotationToOther, wallet, newKey), /different key/);
});

test('a rotation key that is not raw bytes is refused', () => {
  const asString = rotation({ args: [xdr.ScVal.scvString(Buffer.from(newKey))] });
  assert.throws(() => DeviceRotation.require(asString, wallet, newKey), /different key/);
});

test('a call on a different wallet is refused', () => {
  assert.throws(() => DeviceRotation.require(rotation({ contract: otherWallet }), wallet, newKey), /different wallet/);
});

test('another function on the wallet is refused', () => {
  const recovery = rotation({ method: 'recovery_cancel', args: [new Address(wallet).toScVal()] });
  assert.throws(() => DeviceRotation.require(recovery, wallet, newKey), /not a device change/);
  const extraArg = rotation({ args: [xdr.ScVal.scvBytes(Buffer.from(newKey)), xdr.ScVal.scvU32(1)] });
  assert.throws(() => DeviceRotation.require(extraArg, wallet, newKey), /not a device change/);
});
