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

export const wallet = StrKey.encodeContract(Buffer.alloc(32, 1));
export const otherWallet = StrKey.encodeContract(Buffer.alloc(32, 2));
export const latestLedger = 1_000;
export const expiry = latestLedger + 60;
export const passkeyRule = [0];

const source = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

export type RotationShape = {
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

export function rotationBuilt(newKey: Uint8Array, shape: RotationShape = {}): BuiltTransaction {
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
  return { transaction, digest: digestOf(entry), contextRuleIds: passkeyRule, expiryLedger: expiry };
}
