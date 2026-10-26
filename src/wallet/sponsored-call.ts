import { bytesToHex } from '@noble/hashes/utils';
import {
  Address,
  Transaction,
  TransactionBuilder,
  buildAuthorizationEntryPreimage,
  hash,
  xdr,
} from '@stellar/stellar-sdk';

import type { BuiltTransaction } from '../ctx/client.ts';
import { network } from '../stellar/network.ts';

export type ContractCall = {
  contract: string;
  method: string;
  args: xdr.ScVal[];
};

export type AuthorizedCall = ContractCall & {
  nested: ContractCall[];
};

export class SponsoredCall implements AuthorizedCall {
  readonly contract: string;
  readonly method: string;
  readonly args: xdr.ScVal[];
  readonly nested: ContractCall[];
  readonly digest: Uint8Array;

  private constructor(root: ContractCall, nested: ContractCall[], digest: Uint8Array) {
    this.contract = root.contract;
    this.method = root.method;
    this.args = root.args;
    this.nested = nested;
    this.digest = digest;
  }

  static readonly maxExpiryLedgers = 120;

  static verify(
    built: BuiltTransaction,
    wallet: string,
    ruleIds: number[],
    latestLedger: number,
  ): SponsoredCall {
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
    const { subInvocations } = rootInvocation;
    if (1 + subInvocations.length !== ruleIds.length) {
      throw new Error('The authorization covers nested calls the wallet rules do not');
    }
    if (subInvocations.some((invocation) => invocation.subInvocations.length > 0)) {
      throw new Error('The authorization covers nested calls inside nested calls');
    }
    const call = SponsoredCall.contractFn(rootInvocation.function);
    const nested = subInvocations.map((invocation) => SponsoredCall.contractFn(invocation.function));
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
    if (expiration <= latestLedger || expiration > latestLedger + SponsoredCall.maxExpiryLedgers) {
      throw new Error('The authorization expiry is outside the signing window');
    }
    if (built.contextRuleIds.join() !== ruleIds.join()) {
      throw new Error('The authorization names unexpected wallet rules');
    }
    const preimage = buildAuthorizationEntryPreimage(entry, expiration, network.passphrase);
    const digest = authDigest(wallet, hash(preimage.toXDR()), ruleIds);
    if (bytesToHex(digest) !== built.digest.toLowerCase()) {
      throw new Error('The digest to sign does not match the transaction');
    }
    return new SponsoredCall(SponsoredCall.contractCall(call), nested.map(SponsoredCall.contractCall), digest);
  }

  private static contractFn(authorized: xdr.SorobanAuthorizedFunction): xdr.InvokeContractArgs {
    if (authorized.type !== 'sorobanAuthorizedFunctionTypeContractFn') {
      throw new Error('The authorization must cover a contract call');
    }
    return authorized.contractFn;
  }

  private static contractCall(call: xdr.InvokeContractArgs): ContractCall {
    return {
      contract: Address.fromScAddress(call.contractAddress).toString(),
      method: call.functionName.toStringStrict(),
      args: call.args,
    };
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
