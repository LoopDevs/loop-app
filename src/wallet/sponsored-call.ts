import { bytesToHex } from '@noble/hashes/utils';
import {
  Address,
  MuxedAccount,
  StrKey,
  Transaction,
  TransactionBuilder,
  buildAuthorizationEntryPreimage,
  hash,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';

import type { BuiltTransaction } from '../ctx/client.ts';
import type { SignedTransfer } from '../ctx/payment-state.ts';
import { network, type Token } from '../stellar/network.ts';

export type ExpectedPayment = {
  from: string;
  token: Token;
  amount: bigint;
  orderAddress?: string;
};

export type ExpectedWithdrawal = {
  from: string;
  vault: string;
  shares: bigint;
};

export class SponsoredCall {
  readonly contract: string;
  readonly method: string;
  readonly args: xdr.ScVal[];
  readonly digest: Uint8Array;

  private constructor(contract: string, method: string, args: xdr.ScVal[], digest: Uint8Array) {
    this.contract = contract;
    this.method = method;
    this.args = args;
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
    return new SponsoredCall(
      Address.fromScAddress(call.contractAddress).toString(),
      call.functionName.toStringStrict(),
      call.args,
      digest,
    );
  }

  requirePayment({ from, token, amount, orderAddress }: ExpectedPayment): SignedTransfer {
    if (this.contract !== token.contract || this.method !== 'transfer' || this.args.length !== 3) {
      throw new Error(`The transaction is not a ${token.symbol} transfer`);
    }
    const [payer, to, transferred] = this.nativeArgs() as [string, string, bigint];
    if (payer !== from || SponsoredCall.accountOf(to) !== network.payee) {
      throw new Error('The payment goes to an unexpected address');
    }
    if (orderAddress && StrKey.isValidMed25519PublicKey(orderAddress) && to !== orderAddress) {
      throw new Error('The payment is for a different order');
    }
    if (transferred !== amount) {
      throw new Error('The payment amount does not match the order');
    }
    const muxedId = SponsoredCall.muxedIdOf(to);
    return muxedId === undefined ? { amount } : { amount, muxedId };
  }

  requireWithdrawal({ from, vault, shares }: ExpectedWithdrawal): bigint {
    if (this.contract !== vault || this.method !== 'withdraw' || this.args.length !== 3) {
      throw new Error('The transaction is not a withdrawal from the savings vault');
    }
    const [withdrawn, minimums, owner] = this.nativeArgs() as [bigint, bigint[], string];
    if (withdrawn !== shares || owner !== from || minimums.length !== 1) {
      throw new Error('The withdrawal does not match the request');
    }
    return minimums[0];
  }

  private nativeArgs(): unknown[] {
    return this.args.map((arg) => scValToNative(arg));
  }

  private static accountOf(address: string): string {
    if (StrKey.isValidMed25519PublicKey(address)) {
      return MuxedAccount.fromAddress(address, '0').baseAccount().accountId();
    }
    return address;
  }

  private static muxedIdOf(address: string): bigint | undefined {
    if (!StrKey.isValidMed25519PublicKey(address)) {
      return undefined;
    }
    return BigInt(MuxedAccount.fromAddress(address, '0').id());
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
