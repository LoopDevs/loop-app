import { bytesToHex } from '@noble/hashes/utils';
import { MuxedAccount, scValToNative, StrKey, xdr } from '@stellar/stellar-sdk';

import { ctx, type GiftCard, type SmartWalletIntent, type SponsoredResult } from '@/ctx/client';
import { network, type Token } from '@/stellar/network';
import { i128, soroban } from '@/stellar/soroban';
import { units } from '@/stellar/units';
import { base64 } from '@/wallet/base64';
import { deviceSigner } from '@/wallet/device-signer';
import { Holdings } from '@/wallet/holdings';
import { passkey } from '@/wallet/passkey';
import { SponsoredCall } from '@/wallet/sponsored-call';

export type TokenBalance = {
  token: Token;
  amount: bigint;
};

export type Balances = {
  tokens: TokenBalance[];
  vaultShares: bigint;
  vaultValue: bigint;
};

type ContextRule = {
  id: number;
  signers: [string, string, Uint8Array][];
  valid_until: number | null | undefined;
};

export class SmartWallet {
  static readonly passkeyRuleId = 0;
  static readonly deviceRuleId = 1;
  static readonly vaultCurrency = Holdings.savingsCurrency;

  private constructor(
    readonly id: string,
    readonly address: string,
    readonly userId: string,
  ) {}

  static async load(): Promise<SmartWallet | null> {
    const userId = await ctx.userId();
    const links = await ctx.wallets();
    const link = links.find(
      (candidate) => candidate.sponsored && candidate.chain === 'XLM' && candidate.status === 'active',
    );
    if (!link) {
      return null;
    }
    const wallet = new SmartWallet(link.id, link.address, userId);
    await wallet.verify();
    return wallet;
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
    await wallet.verify(created.publicKey);
    return wallet;
  }

  async verify(passkeyPublicKey?: Uint8Array): Promise<void> {
    const devicePublicKey = await deviceSigner.publicKey(this.userId);
    if (!devicePublicKey) {
      throw new Error('This device has no wallet key');
    }
    const [wasmHash, ruleCount, passkeyRule, deviceRule] = await Promise.all([
      soroban.wasmHash(this.address),
      soroban.read(this.address, 'get_context_rules_count'),
      this.rule(SmartWallet.passkeyRuleId),
      this.rule(SmartWallet.deviceRuleId),
    ]);
    if (wasmHash !== network.accountWasmHash) {
      throw new Error('The wallet runs unexpected code');
    }
    if (ruleCount !== 2) {
      throw new Error('The wallet has unexpected rules');
    }
    this.requireSigner(passkeyRule, network.webauthnVerifier, passkeyPublicKey);
    this.requireSigner(deviceRule, network.ed25519Verifier, base64.decode(devicePublicKey));
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

  async pay(giftCard: GiftCard, onSending: () => void): Promise<SponsoredResult> {
    const token = network.tokens.find((candidate) => candidate.currency === giftCard.paymentCryptoCurrency);
    if (!token || !giftCard.paymentCryptoAmount) {
      throw new Error('The order has no Stellar price this wallet can pay');
    }
    const intent: SmartWalletIntent = { intent: 'pay', paymentId: giftCard.paymentId };
    const built = await ctx.buildTransaction(this.id, intent);
    const call = SponsoredCall.verify(built, this.address, [SmartWallet.deviceRuleId]);
    this.requirePayment(call, token, units.parse(giftCard.paymentCryptoAmount));
    return this.signAndSponsor(intent, built.transaction, call, onSending);
  }

  async withdraw(shares: bigint): Promise<SponsoredResult> {
    const intent: SmartWalletIntent = {
      intent: 'vault_withdraw',
      currency: SmartWallet.vaultCurrency,
      shares: shares.toString(),
    };
    const built = await ctx.buildTransaction(this.id, intent);
    const call = SponsoredCall.verify(built, this.address, [SmartWallet.deviceRuleId]);
    await this.requireWithdraw(call, shares);
    return this.signAndSponsor(intent, built.transaction, call);
  }

  private async signAndSponsor(
    intent: SmartWalletIntent,
    transaction: string,
    call: SponsoredCall,
    onSending?: () => void,
  ): Promise<SponsoredResult> {
    const devicePublicKey = await deviceSigner.publicKey(this.userId);
    if (!devicePublicKey) {
      throw new Error('This device has no wallet key');
    }
    const signature = await deviceSigner.sign(this.userId, call.digest);
    onSending?.();
    return ctx.sponsorTransaction(this.id, intent, {
      transaction,
      signature,
      devicePublicKey,
    });
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

  private requirePayment(call: SponsoredCall, token: Token, amount: bigint): void {
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
  }

  private async rule(id: number): Promise<ContextRule> {
    return (await soroban.read(this.address, 'get_context_rule', [xdr.ScVal.scvU32(id)])) as ContextRule;
  }

  private requireSigner(rule: ContextRule, verifier: string, publicKey?: Uint8Array): void {
    if (rule.signers.length !== 1 || rule.valid_until != null) {
      throw new Error(`Wallet rule ${rule.id} is not a single permanent signer`);
    }
    const [kind, signerVerifier, keyData] = rule.signers[0];
    if (kind !== 'External' || signerVerifier !== verifier) {
      throw new Error(`Wallet rule ${rule.id} uses an unexpected verifier`);
    }
    if (publicKey && bytesToHex(keyData) !== bytesToHex(publicKey)) {
      throw new Error(`Wallet rule ${rule.id} holds a different key`);
    }
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
