import { bytesToHex } from '@noble/hashes/utils';
import {
  Address,
  Transaction,
  TransactionBuilder,
  buildAuthorizationEntryPreimage,
  hash,
  xdr,
} from '@stellar/stellar-sdk';

import type { BuiltTransaction } from '@/ctx/client';
import { network } from '@/stellar/network';

export class SponsoredCall {
  private constructor(
    readonly contract: string,
    readonly method: string,
    readonly args: xdr.ScVal[],
    readonly digest: Uint8Array,
  ) {}

  static verify(built: BuiltTransaction, wallet: string, ruleIds: number[]): SponsoredCall {
    const transaction = TransactionBuilder.fromXDR(built.transaction, network.passphrase);
    if (!(transaction instanceof Transaction) || transaction.operations.length !== 1) {
      throw new Error('The sponsored transaction must hold exactly one operation');
    }
    const [operation] = transaction.operations;
    if (operation.type !== 'invokeHostFunction') {
      throw new Error('The sponsored transaction must invoke a contract');
    }
    const auth = operation.auth ?? [];
    if (auth.length !== 1) {
      throw new Error('The sponsored transaction must hold exactly one authorization');
    }
    const [entry] = auth;
    const { credentials, rootInvocation } = entry;
    if (credentials.type !== 'sorobanCredentialsAddress') {
      throw new Error('The authorization must be signed by an address');
    }
    if (Address.fromScAddress(credentials.address.address).toString() !== wallet) {
      throw new Error('The authorization is for a different wallet');
    }
    if (rootInvocation.subInvocations.length > 0) {
      throw new Error('The authorization covers nested calls');
    }
    const authorized = rootInvocation.function;
    if (authorized.type !== 'sorobanAuthorizedFunctionTypeContractFn') {
      throw new Error('The authorization must cover a contract call');
    }
    const call = authorized.contractFn;
    if (
      operation.func.type !== 'hostFunctionTypeInvokeContract' ||
      !operation.func.invokeContract.equals(call)
    ) {
      throw new Error('The authorization does not match the transaction call');
    }
    const expiration = credentials.address.signatureExpirationLedger;
    if (expiration !== built.expiryLedger) {
      throw new Error('The authorization expiry does not match');
    }
    if (built.contextRuleIds.join() !== ruleIds.join()) {
      throw new Error('The authorization names unexpected wallet rules');
    }
    const preimage = buildAuthorizationEntryPreimage(entry, expiration, network.passphrase);
    const digest = authDigest(wallet, hash(preimage.toXDR()), ruleIds);
    if (bytesToHex(digest) !== built.digest.toLowerCase()) {
      throw new Error('The digest to sign does not match the transaction');
    }
    return new SponsoredCall(
      Address.fromScAddress(call.contractAddress).toString(),
      call.functionName.toStringStrict(),
      call.args,
      digest,
    );
  }
}

function authDigest(
  wallet: string,
  signaturePayload: ReturnType<typeof hash>,
  ruleIds: number[],
): Uint8Array {
  const preimage = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('account'),
      val: new Address(wallet).toScVal(),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('context_rule_ids'),
      val: xdr.ScVal.scvVec(ruleIds.map((id) => xdr.ScVal.scvU32(id))),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('signature_payload'),
      val: xdr.ScVal.scvBytes(signaturePayload),
    }),
  ]);
  return hash(preimage.toXDR());
}
