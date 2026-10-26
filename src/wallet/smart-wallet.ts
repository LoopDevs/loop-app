import { MuxedAccount, scValToNative, StrKey, xdr } from '@stellar/stellar-sdk';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { ctx, type BuiltTransaction, type SmartWalletIntent, type SponsoredResult } from '@/ctx/client';
import type { BuyTimer } from '@/ctx/buy-timer';
import type { SignedPayment } from '@/ctx/payment-sender';
import type { PaymentState, SignedTransfer } from '@/ctx/payment-state';
import { network, type Token } from '@/stellar/network';
import { i128, soroban } from '@/stellar/soroban';
import { units } from '@/stellar/units';
import { base64 } from '@/wallet/base64';
import { MissingDeviceSecret } from '@/wallet/device-key';
import { DeviceLink } from '@/wallet/device-link';
import { deviceSigner } from '@/wallet/device-signer';
import { Holdings } from '@/wallet/holdings';
import { passkey } from '@/wallet/passkey';
import { PaymentSearch } from '@/wallet/payment-search';
import { Savings } from '@/wallet/savings';
import { SavingsTopUp } from '@/wallet/savings-top-up';
import { SentPaymentCheck, type Payable, type SentTransaction } from '@/wallet/sent-payment-check';
import { SponsoredCall } from '@/wallet/sponsored-call';
import { VaultCall, type SentVaultCall } from '@/wallet/vault-call';
import { WalletPin } from '@/wallet/wallet-pin';
import { WalletRules, type ContextRule, type WalletCheck } from '@/wallet/wallet-rules';

export type TokenBalance = {
  token: Token;
  amount: bigint;
};

export type Balances = {
  tokens: TokenBalance[];
  vaultShares: bigint;
  vaultValue: bigint;
};

export class UnlinkedDevice extends Error {
  constructor(readonly wallet: SmartWallet) {
    super('Loop is not set up on this device yet. Open Home to set it up.');
  }
}

export class SmartWallet {
  static readonly passkeyRuleId = 0;
  static readonly deviceRuleId = 1;

  private constructor(
    readonly id: string,
    readonly address: string,
    readonly userId: string,
  ) {}

  static async load(): Promise<SmartWallet | null> {
    const userId = await ctx.userId();
    const pin = new WalletPin(AsyncStorage, userId);
    const [links, pinned] = await Promise.all([ctx.wallets(), pin.read()]);
    const link = WalletPin.choose(links, pinned);
    if (!link) {
      return null;
    }
    const wallet = new SmartWallet(link.id, link.address, userId);
    const checked = await wallet.verify(pinned ? base64.decode(pinned.passkeyPublicKey) : undefined);
    if (checked.thisDevice === 'unlinked') {
      throw new UnlinkedDevice(wallet);
    }
    if (!pinned) {
      await pin.write({ address: wallet.address, passkeyPublicKey: base64.encode(checked.passkeyPublicKey) });
    }
    return wallet;
  }

  static unlessUnlinked(error: unknown): null {
    if (error instanceof UnlinkedDevice) {
      return null;
    }
    throw error;
  }

  static async create(label: string): Promise<SmartWallet> {
    const existing = await SmartWallet.load();
    if (existing) {
      return existing;
    }
    const userId = await ctx.userId();
    const devicePublicKey = await deviceSigner.create(userId);
    const created = await passkey.create(label);
    const link = await ctx.deployWallet({
      credentialId: created.credentialId,
      passkeyPublicKey: base64.encode(created.publicKey),
      devicePublicKey,
    });
    const wallet = new SmartWallet(link.id, link.address, userId);
    if ((await wallet.verify(created.publicKey)).thisDevice !== 'linked') {
      throw new Error('The new wallet does not hold this device key');
    }
    await new WalletPin(AsyncStorage, userId).write({
      address: wallet.address,
      passkeyPublicKey: base64.encode(created.publicKey),
    });
    return wallet;
  }

  async verify(passkeyPublicKey?: Uint8Array): Promise<WalletCheck> {
    const [devicePublicKey, wasmHash, ruleCount, passkeyRule, deviceRule] = await Promise.all([
      deviceSigner.publicKey(this.userId),
      soroban.wasmHash(this.address),
      soroban.read(this.address, 'get_context_rules_count'),
      this.rule(SmartWallet.passkeyRuleId),
      this.rule(SmartWallet.deviceRuleId),
    ]);
    return WalletRules.check(
      { wasmHash, ruleCount, passkeyRule, deviceRule },
      passkeyPublicKey,
      devicePublicKey ? base64.decode(devicePublicKey) : null,
    );
  }

  async addThisDevice(signal?: AbortSignal): Promise<void> {
    const pin = new WalletPin(AsyncStorage, this.userId);
    const pinned = await pin.read();
    const checked = await this.verify(pinned ? base64.decode(pinned.passkeyPublicKey) : undefined);
    const { passkeyPublicKey } = checked;
    if (checked.thisDevice === 'linked') {
      await pin.write({ address: this.address, passkeyPublicKey: base64.encode(passkeyPublicKey) });
      return;
    }
    await this.deviceLink().add(this.address, passkeyPublicKey, signal);
    await pin.write({ address: this.address, passkeyPublicKey: base64.encode(passkeyPublicKey) });
  }

  async balances(): Promise<Balances> {
    const [tokens, vaultShares] = await Promise.all([
      Promise.all(network.tokens.map((token) => this.tokenBalance(token))),
      soroban.balance(network.usdcVault, this.address),
    ]);
    const vaultValue = vaultShares === 0n ? 0n : await this.valueOf(vaultShares);
    return { tokens, vaultShares, vaultValue };
  }

  async fundWithFriendbot(): Promise<void> {
    if (!network.friendbotUrl) {
      throw new Error('Friendbot is only available on testnet');
    }
    const response = await fetch(`${network.friendbotUrl}/?addr=${this.address}`);
    if (!response.ok) {
      throw new Error(`Friendbot ${response.status}: ${await response.text()}`);
    }
  }

  async pay(payable: Payable, timer: BuyTimer | null = null): Promise<SignedPayment> {
    const token = network.tokens.find((candidate) => candidate.currency === payable.paymentCryptoCurrency);
    if (!token || !payable.paymentCryptoAmount) {
      throw new Error('The payment has no Stellar price this wallet can pay');
    }
    const intent: SmartWalletIntent = { intent: 'pay', paymentId: payable.paymentId };
    const built = await ctx.buildTransaction(this.id, intent);
    timer?.mark('payment built');
    const call = await this.verifiedCall(built, [SmartWallet.deviceRuleId]);
    timer?.mark('ledger read');
    const transfer = this.requirePayment(call, token, units.parse(payable.paymentCryptoAmount));
    const signed = await this.sign(call);
    timer?.mark('signed');
    return {
      expiryLedger: built.expiryLedger,
      transfer,
      sponsor: async () => {
        const result = await ctx.sponsorTransaction(this.id, intent, { transaction: built.transaction, ...signed });
        timer?.mark('submitted');
        return result;
      },
    };
  }

  sentPaymentFailure(payable: Payable, sent: SentTransaction): Promise<PaymentState | null> {
    return new SentPaymentCheck({
      tokens: network.tokens,
      transaction: (hash) => soroban.transaction(hash),
      latestLedger: () => soroban.latestLedger(),
      landed: (token, expected, expiryLedger) => this.paymentLanded(token, expected, expiryLedger),
    }).failure(payable, sent);
  }

  private paymentLanded(token: Token, expected: SignedTransfer | null, expiryLedger: number): Promise<boolean> {
    return new PaymentSearch(soroban, this.address, network.payee).landed(token.contract, expected, expiryLedger);
  }

  async withdraw(shares: bigint): Promise<SentVaultCall> {
    const intent: SmartWalletIntent = {
      intent: 'vault_withdraw',
      currency: Savings.currency,
      shares: shares.toString(),
    };
    const built = await ctx.buildTransaction(this.id, intent);
    const call = await this.verifiedCall(built, [SmartWallet.deviceRuleId]);
    await this.requireWithdraw(call, shares);
    const result = await this.signAndSponsor(intent, built.transaction, call);
    return { ...result, expiryLedger: built.expiryLedger };
  }

  async deposit(amount: bigint): Promise<SentVaultCall> {
    const intent = Savings.depositIntent(amount);
    const built = await ctx.buildTransaction(this.id, intent);
    const call = await this.verifiedCall(built, [SmartWallet.deviceRuleId, SmartWallet.deviceRuleId]);
    Savings.requireDeposit(call, this.address, amount);
    const result = await this.signAndSponsor(intent, built.transaction, call);
    return { ...result, expiryLedger: built.expiryLedger };
  }

  vaultCall(): VaultCall {
    return new VaultCall({
      transaction: (hash) => soroban.transaction(hash),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: () => Date.now(),
    });
  }

  savingsTopUp(): SavingsTopUp {
    return new SavingsTopUp({
      balances: () => this.balances(),
      valueOf: (shares) => this.valueOf(shares),
      withdraw: (shares) => this.withdraw(shares),
      vaultCall: this.vaultCall(),
      now: () => Date.now(),
    });
  }

  private async verifiedCall(built: BuiltTransaction, ruleIds: number[]): Promise<SponsoredCall> {
    return SponsoredCall.verify(built, this.address, ruleIds, await soroban.latestLedger());
  }

  private async signAndSponsor(
    intent: SmartWalletIntent,
    transaction: string,
    call: SponsoredCall,
  ): Promise<SponsoredResult> {
    const signed = await this.sign(call);
    return ctx.sponsorTransaction(this.id, intent, { transaction, ...signed }).catch((error: unknown) => {
      throw Savings.sponsorFailure(error);
    });
  }

  private async sign(call: SponsoredCall): Promise<{ signature: string; devicePublicKey: string }> {
    const devicePublicKey = await deviceSigner.publicKey(this.userId);
    if (!devicePublicKey) {
      throw new Error('This device has no wallet key');
    }
    const signature = await deviceSigner.sign(this.userId, call.digest).catch((error: unknown) => {
      throw error instanceof MissingDeviceSecret ? new UnlinkedDevice(this) : error;
    });
    return { signature, devicePublicKey };
  }

  private async tokenBalance(token: Token): Promise<TokenBalance> {
    return { token, amount: await soroban.balance(token.contract, this.address) };
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

  private requirePayment(call: SponsoredCall, token: Token, amount: bigint): SignedTransfer {
    if (call.contract !== token.contract || call.method !== 'transfer' || call.args.length !== 3) {
      throw new Error(`The transaction is not a ${token.symbol} transfer`);
    }
    const [from, to, transferred] = call.args.map((arg) => scValToNative(arg)) as [string, string, bigint];
    if (from !== this.address || SmartWallet.accountOf(to) !== network.payee) {
      throw new Error('The payment goes to an unexpected address');
    }
    if (transferred !== amount) {
      throw new Error('The payment amount does not match the order');
    }
    const muxedId = SmartWallet.muxedIdOf(to);
    return muxedId === undefined ? { amount } : { amount, muxedId };
  }

  private async rule(id: number): Promise<ContextRule> {
    return (await soroban.read(this.address, 'get_context_rule', [xdr.ScVal.scvU32(id)])) as ContextRule;
  }

  private deviceLink(): DeviceLink {
    return new DeviceLink({
      createDeviceKey: () => deviceSigner.create(this.userId),
      buildTransaction: (intent) => ctx.buildTransaction(this.id, intent),
      sponsorTransaction: (intent, signed) => ctx.sponsorTransaction(this.id, intent, signed),
      signWithPasskey: (challenge) => passkey.sign(challenge),
      latestLedger: () => soroban.latestLedger(),
      deviceRule: () => this.rule(SmartWallet.deviceRuleId),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    });
  }

  private async requireWithdraw(call: SponsoredCall, shares: bigint): Promise<void> {
    if (call.contract !== network.usdcVault || call.method !== 'withdraw' || call.args.length !== 3) {
      throw new Error('The transaction is not a withdrawal from the savings vault');
    }
    const [amount, minimums, from] = call.args.map((arg) => scValToNative(arg)) as [
      bigint,
      bigint[],
      string,
    ];
    if (amount !== shares || from !== this.address || minimums.length !== 1) {
      throw new Error('The withdrawal does not match the request');
    }
    if (minimums[0] < Holdings.floorOf(await this.valueOf(shares))) {
      throw new Error('The withdrawal minimum is too low');
    }
  }

  private async valueOf(shares: bigint): Promise<bigint> {
    const [value] = (await soroban.read(network.usdcVault, 'get_asset_amounts_per_shares', [
      i128(shares),
    ])) as bigint[];
    return value;
  }
}
