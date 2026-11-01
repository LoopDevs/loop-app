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
  orderAddress: string | undefined;
};

export type ExpectedWithdrawal = {
  from: string;
  vault: string;
  shares: bigint;
};

export type ExpectedDeposit = {
  from: string;
  vault: string;
  token: Token;
  amount: bigint;
};

export type ContractCall = {
  contract: string;
  method: string;
  args: xdr.ScVal[];
};

export class SponsoredCall {
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

  requirePayment({ from, token, amount, orderAddress }: ExpectedPayment): SignedTransfer {
    if (
      this.contract !== token.contract ||
      this.method !== 'transfer' ||
      !this.argsAre(['scvAddress', 'scvAddress', 'scvI128'])
    ) {
      throw new Error(`The transaction is not a ${token.symbol} transfer`);
    }
    const [payer, to, transferred] = this.nativeArgs() as [string, string, bigint];
    if (payer !== from || SponsoredCall.accountOf(to) !== network.payee) {
      throw new Error('The payment goes to an unexpected address');
    }
    if (to !== orderAddress) {
      throw new Error('The payment is for a different order');
    }
    if (transferred !== amount) {
      throw new Error('The payment amount does not match the order');
    }
    const muxedId = SponsoredCall.muxedIdOf(to);
    return muxedId === undefined ? { amount } : { amount, muxedId };
  }

  requireWithdrawal({ from, vault, shares }: ExpectedWithdrawal): bigint {
    if (
      this.contract !== vault ||
      this.method !== 'withdraw' ||
      !this.argsAre(['scvI128', 'scvVec', 'scvAddress']) ||
      !this.vecOf(this.args[1]).every((minimum) => minimum.type === 'scvI128')
    ) {
      throw new Error('The transaction is not a withdrawal from the savings vault');
    }
    const [withdrawn, minimums, owner] = this.nativeArgs() as [bigint, bigint[], string];
    if (withdrawn !== shares || owner !== from || minimums.length !== 1) {
      throw new Error('The withdrawal does not match the request');
    }
    return minimums[0];
  }

  requireDeposit({ from, vault, token, amount }: ExpectedDeposit): void {
    if (
      this.contract !== vault ||
      this.method !== 'deposit' ||
      !this.argsAre(['scvVec', 'scvVec', 'scvAddress', 'scvBool']) ||
      ![this.args[0], this.args[1]].every((amounts) => this.vecOf(amounts).every((each) => each.type === 'scvI128'))
    ) {
      throw new Error('The transaction is not a deposit into the savings vault');
    }
    const [desired, minimums, owner, invest] = this.nativeArgs() as [bigint[], bigint[], string, boolean];
    if (desired.length !== 1 || desired[0] !== amount) {
      throw new Error('The deposit amount does not match the request');
    }
    if (minimums.length !== 1 || minimums[0] > amount) {
      throw new Error('The deposit minimum is above the amount');
    }
    if (owner !== from || invest !== true) {
      throw new Error('The deposit does not match the request');
    }
    if (this.nested.length !== 1) {
      throw new Error(`The deposit must authorize exactly one ${token.symbol} transfer`);
    }
    const [transfer] = this.nested;
    if (
      transfer.contract !== token.contract ||
      transfer.method !== 'transfer' ||
      !SponsoredCall.argsOfTypes(transfer.args, ['scvAddress', 'scvAddress', 'scvI128'])
    ) {
      throw new Error(`The deposit transfer is not a ${token.symbol} transfer`);
    }
    const [payer, to, transferred] = transfer.args.map((arg) => scValToNative(arg)) as [string, string, bigint];
    if (payer !== from || to !== vault || transferred !== amount) {
      throw new Error('The deposit transfer does not match the request');
    }
  }

  private argsAre(types: xdr.ScVal['type'][]): boolean {
    return SponsoredCall.argsOfTypes(this.args, types);
  }

  private static argsOfTypes(args: xdr.ScVal[], types: xdr.ScVal['type'][]): boolean {
    return args.length === types.length && args.every((arg, index) => arg.type === types[index]);
  }

  private vecOf(value: xdr.ScVal): xdr.ScVal[] {
    return value.type === 'scvVec' ? (value.vec ?? []) : [];
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

  static muxedIdOf(address: string): bigint | undefined {
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
