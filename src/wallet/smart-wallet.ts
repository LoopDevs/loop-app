import { xdr } from '@stellar/stellar-sdk';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import {
  ctx,
  type BuiltTransaction,
  type GiftCard,
  type SmartWalletIntent,
  type SponsoredResult,
} from '@/ctx/client';
import type { BuyTimer } from '@/ctx/buy-timer';
import type { SignedPayment } from '@/ctx/payment-sender';
import type { SignedTransfer } from '@/ctx/payment-state';
import type { TokenStorage } from '@/session/install-scoped-token';
import { secureTokenStorage } from '@/session/secure-token-storage';
import { network, type Token } from '@/stellar/network';
import { holdCriticalReload } from '@/updates/update-checker';
import { i128, soroban } from '@/stellar/soroban';
import { units } from '@/stellar/units';
import { base64 } from '@/wallet/base64';
import { MissingDeviceSecret } from '@/wallet/device-key';
import { DeviceLink } from '@/wallet/device-link';
import { deviceSigner } from '@/wallet/device-signer';
import { Holdings } from '@/wallet/holdings';
import { passkey, type Passkey } from '@/wallet/passkey';
import { PaymentSearch, type OrderPayment } from '@/wallet/payment-search';
import { Savings } from '@/wallet/savings';
import { SavingsTopUp, type SentWithdrawal } from '@/wallet/savings-top-up';
import { SponsoredCall } from '@/wallet/sponsored-call';
import { WalletCreation } from '@/wallet/wallet-creation';
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

  private static readonly creation = new WalletCreation<SmartWallet>();
  private static readonly pinStorage: TokenStorage = Platform.OS === 'web' ? AsyncStorage : secureTokenStorage;

  private static pinFor(userId: string): WalletPin {
    return new WalletPin(SmartWallet.pinStorage, userId, () => ctx.userId());
  }

  static async load(): Promise<SmartWallet | null> {
    const userId = await ctx.userId();
    await SmartWallet.creation.settled(userId);
    if ((await ctx.userId()) !== userId) {
      return SmartWallet.load();
    }
    const pin = SmartWallet.pinFor(userId);
    const [links, pinned] = await Promise.all([ctx.wallets(), pin.read()]);
    const link = WalletPin.choose(links, pinned);
    if (!link) {
      return null;
    }
    const wallet = new SmartWallet(link.id, link.address, userId);
    const checked = await wallet.verify(pinned ? base64.decode(pinned.passkeyPublicKey) : undefined);
    if (!(await pin.admits(pinned, wallet.address, checked))) {
      throw new UnlinkedDevice(wallet);
    }
    return wallet;
  }

  sameAs(other: SmartWallet | null): boolean {
    return other !== null && other.id === this.id && other.address === this.address && other.userId === this.userId;
  }

  static unlessUnlinked(error: unknown): null {
    if (error instanceof UnlinkedDevice) {
      return null;
    }
    throw error;
  }

  static async create(label: string): Promise<void> {
    if (await SmartWallet.load()) {
      return;
    }
    const userId = await ctx.userId();
    const pin = SmartWallet.pinFor(userId);
    const devicePublicKey = await deviceSigner.create(userId);
    await holdCriticalReload(async () => {
      const created = await pin.passkeyForSetup(
        () => passkey.create(label),
        (challenge) => passkey.sign(challenge),
      );
      SmartWallet.creation.start(
        userId,
        holdCriticalReload(() => SmartWallet.deploy(pin, userId, devicePublicKey, created)),
      );
    });
  }

  private static async deploy(
    pin: WalletPin,
    userId: string,
    devicePublicKey: string,
    created: Passkey,
  ): Promise<SmartWallet> {
    await pin.requireCurrentUser();
    const link = await ctx.deployWallet(userId, {
      credentialId: created.credentialId,
      passkeyPublicKey: base64.encode(created.publicKey),
      devicePublicKey,
    });
    const wallet = new SmartWallet(link.id, link.address, userId);
    if ((await wallet.verify(created.publicKey)).thisDevice !== 'linked') {
      throw new Error('The new wallet does not hold this device key');
    }
    await pin.write({
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
    const pin = SmartWallet.pinFor(this.userId);
    const pinned = await pin.read();
    const checked = await this.verify(pinned ? base64.decode(pinned.passkeyPublicKey) : undefined);
    await pin.confirmThisDevice(
      pinned,
      this.address,
      checked,
      () => holdCriticalReload(() => this.deviceLink().add(this.address, checked.passkeyPublicKey, signal)),
      (challenge) => passkey.sign(challenge),
    );
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

  async pay(giftCard: GiftCard, timer: BuyTimer | null = null): Promise<SignedPayment> {
    const token = network.tokens.find((candidate) => candidate.currency === giftCard.paymentCryptoCurrency);
    if (!token || !giftCard.paymentCryptoAmount) {
      throw new Error('The order has no Stellar price this wallet can pay');
    }
    const intent: SmartWalletIntent = { intent: 'pay', paymentId: giftCard.paymentId };
    const built = await ctx.buildTransaction(this.id, intent);
    timer?.mark('payment built');
    const call = await this.verifiedCall(built);
    timer?.mark('ledger read');
    const transfer = call.requirePayment({
      from: this.address,
      token,
      amount: units.parse(giftCard.paymentCryptoAmount),
      orderAddress: giftCard.paymentCryptoAddress,
    });
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

  paymentLanded(token: Token, expected: SignedTransfer | null, expiryLedger: number): Promise<boolean> {
    return new PaymentSearch(soroban, this.address, network.payee).landed(token.contract, expected, expiryLedger);
  }

  orderPaid(giftCard: GiftCard): Promise<OrderPayment> {
    return new PaymentSearch(soroban, this.address, network.payee).orderPaid(giftCard, Date.now());
  }

  async transactionLanded(hash: string): Promise<boolean> {
    return (await soroban.transaction(hash)).status === 'SUCCESS';
  }

  withdraw(shares: bigint): Promise<SentWithdrawal> {
    return holdCriticalReload(async () => {
      const intent: SmartWalletIntent = {
        intent: 'vault_withdraw',
        currency: Savings.currency,
        shares: shares.toString(),
      };
      const built = await ctx.buildTransaction(this.id, intent);
      const call = await this.verifiedCall(built);
      await this.requireWithdraw(call, shares);
      const result = await this.signAndSponsor(intent, built.transaction, call);
      return { ...result, expiryLedger: built.expiryLedger };
    });
  }

  savingsTopUp(): SavingsTopUp {
    return new SavingsTopUp({
      balances: () => this.balances(),
      valueOf: (shares) => this.valueOf(shares),
      withdraw: (shares) => this.withdraw(shares),
      transaction: (hash) => soroban.transaction(hash),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: () => Date.now(),
    });
  }

  private async verifiedCall(built: BuiltTransaction): Promise<SponsoredCall> {
    return SponsoredCall.verify(built, this.address, [SmartWallet.deviceRuleId], await soroban.latestLedger());
  }

  private async signAndSponsor(
    intent: SmartWalletIntent,
    transaction: string,
    call: SponsoredCall,
  ): Promise<SponsoredResult> {
    return ctx.sponsorTransaction(this.id, intent, {
      transaction,
      ...(await this.sign(call)),
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
    const minimum = call.requireWithdrawal({ from: this.address, vault: network.usdcVault, shares });
    if (minimum < Holdings.floorOf(await this.valueOf(shares))) {
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
