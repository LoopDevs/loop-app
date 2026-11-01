import { randomBytes } from '@noble/hashes/utils';
import { xdr } from '@stellar/stellar-sdk';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import {
  ctx,
  type BuiltTransaction,
  type GiftCard,
  type SmartWalletIntent,
} from '@/ctx/client';
import type { BuyTimer } from '@/ctx/buy-timer';
import type { SignedPayment } from '@/ctx/payment-sender';
import type { SignedTransfer } from '@/ctx/payment-state';
import type { TokenStorage } from '@/session/install-scoped-token';
import { secureTokenStorage } from '@/session/secure-token-storage';
import { network, type PaymentCurrency, type Token } from '@/stellar/network';
import { holdCriticalReload } from '@/updates/update-checker';
import { i128, soroban } from '@/stellar/soroban';
import { units } from '@/stellar/units';
import { base64 } from '@/wallet/base64';
import { MissingDeviceSecret } from '@/wallet/device-key';
import { DeviceLink } from '@/wallet/device-link';
import { deviceSigner } from '@/wallet/device-signer';
import { Holdings } from '@/wallet/holdings';
import { passkey, type Passkey } from '@/wallet/passkey';
import type { PasskeyAssertion } from '@/wallet/passkey-assertion';
import { PaymentSearch, type OrderPayment } from '@/wallet/payment-search';
import { Savings, type SavingsBalance } from '@/wallet/savings';
import { SavingsTopUp, type SentWithdrawal, type SignedWithdrawal } from '@/wallet/savings-top-up';
import { SponsoredCall } from '@/wallet/sponsored-call';
import { WalletCreation } from '@/wallet/wallet-creation';
import { WalletIdentity } from '@/wallet/wallet-identity';
import { WalletPin } from '@/wallet/wallet-pin';
import { WalletRules, type ContextRule, type WalletCheck } from '@/wallet/wallet-rules';

export type TokenBalance = {
  token: Token;
  amount: bigint;
};

export type Balances = {
  tokens: TokenBalance[];
  savings: SavingsBalance[];
};

export class WalletBlocked extends Error {
  constructor(
    readonly wallet: SmartWallet,
    message: string,
  ) {
    super(message);
  }
}

export class UnlinkedDevice extends WalletBlocked {
  constructor(wallet: SmartWallet) {
    super(wallet, 'Loop is not set up on this device yet. Open Home to set it up.');
  }
}

export class UnconfirmedIdentity extends WalletBlocked {
  constructor(wallet: SmartWallet) {
    super(wallet, 'Confirm it’s you on Home to use your balance here.');
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
  private static readonly confirmed = new Set<string>();
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
    const checked = await wallet.verify();
    const held = WalletPin.current(pinned, wallet.address, checked.passkeyPublicKey);
    if (!(await pin.admits(held, wallet.address, checked))) {
      throw new UnlinkedDevice(wallet);
    }
    if (Platform.OS === 'web' && !SmartWallet.confirmed.has(wallet.address)) {
      throw new UnconfirmedIdentity(wallet);
    }
    return wallet;
  }

  sameAs(other: SmartWallet | null): boolean {
    return other !== null && other.id === this.id && other.address === this.address && other.userId === this.userId;
  }

  static unlessBlocked(error: unknown): null {
    if (error instanceof WalletBlocked) {
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
    SmartWallet.confirmed.add(wallet.address);
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
    const checked = await this.verify();
    const held = WalletPin.current(pinned, this.address, checked.passkeyPublicKey);
    await pin.confirmThisDevice(
      held,
      this.address,
      checked,
      () =>
        holdCriticalReload(() =>
          this.deviceLink(checked.passkeyPublicKey).add(this.address, checked.passkeyPublicKey, signal),
        ),
      this.proof(checked.passkeyPublicKey),
    );
  }

  async confirmIdentity(): Promise<void> {
    const checked = await this.verify();
    await this.proof(checked.passkeyPublicKey)(randomBytes(32));
  }

  async balances(): Promise<Balances> {
    const [tokens, savings] = await Promise.all([
      Promise.all(network.tokens.map((token) => this.tokenBalance(token))),
      Promise.all(Savings.currencies.map((currency) => this.savingsBalance(currency))),
    ]);
    return { tokens, savings };
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

  paymentMissing(token: Token, expected: SignedTransfer | null, expiryLedger: number): Promise<boolean> {
    return new PaymentSearch(soroban, this.address, network.payee).missing(token.contract, expected, expiryLedger);
  }

  orderPaid(giftCard: GiftCard): Promise<OrderPayment> {
    return new PaymentSearch(soroban, this.address, network.payee).orderPaid(giftCard, Date.now());
  }

  async transactionLanded(hash: string): Promise<boolean> {
    return (await soroban.transaction(hash)).status === 'SUCCESS';
  }

  async withdraw(currency: PaymentCurrency, shares: bigint): Promise<SentWithdrawal> {
    return SavingsTopUp.send(await this.signWithdrawal(currency, shares));
  }

  savingsTopUp(currency: PaymentCurrency): SavingsTopUp {
    return new SavingsTopUp(
      {
        balances: () => this.balances(),
        valueOf: (shares) => this.valueOf(currency, shares),
        signWithdrawal: (shares) => this.signWithdrawal(currency, shares),
      transaction: (hash) => soroban.transaction(hash),
        latestLedger: () => soroban.latestLedger(),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        now: () => Date.now(),
      },
      currency,
    );
  }

  private signWithdrawal(currency: PaymentCurrency, shares: bigint): Promise<SignedWithdrawal> {
    return holdCriticalReload(() => this.buildSignedWithdrawal(currency, shares));
  }

  private async buildSignedWithdrawal(currency: PaymentCurrency, shares: bigint): Promise<SignedWithdrawal> {
    const intent: SmartWalletIntent = {
      intent: 'vault_withdraw',
      currency,
      shares: shares.toString(),
    };
    const built = await ctx.buildTransaction(this.id, intent);
    const call = await this.verifiedCall(built);
    await this.requireWithdraw(call, currency, shares);
    const signed = await this.sign(call);
    return {
      expiryLedger: built.expiryLedger,
      sponsor: () =>
        holdCriticalReload(() =>
          ctx.sponsorTransaction(this.id, intent, { transaction: built.transaction, ...signed }),
        ),
    };
  }

  private async verifiedCall(built: BuiltTransaction): Promise<SponsoredCall> {
    return SponsoredCall.verify(built, this.address, [SmartWallet.deviceRuleId], await soroban.latestLedger());
  }

  private async sign(call: SponsoredCall): Promise<{ signature: string; devicePublicKey: string }> {
    if (Platform.OS === 'web' && !SmartWallet.confirmed.has(this.address)) {
      throw new UnconfirmedIdentity(this);
    }
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

  private deviceLink(passkeyPublicKey: Uint8Array): DeviceLink {
    return new DeviceLink({
      createDeviceKey: () => deviceSigner.create(this.userId),
      buildTransaction: (intent) => ctx.buildTransaction(this.id, intent),
      sponsorTransaction: (intent, signed) => ctx.sponsorTransaction(this.id, intent, signed),
      signWithPasskey: this.proof(passkeyPublicKey),
      latestLedger: () => soroban.latestLedger(),
      deviceRule: () => this.rule(SmartWallet.deviceRuleId),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    });
  }

  private proof(passkeyPublicKey: Uint8Array): (challenge: Uint8Array) => Promise<PasskeyAssertion> {
    const identity = new WalletIdentity(this.address, {
      signWithPasskey: (challenge) => passkey.sign(challenge),
      addressOf: (credentialId) => this.walletAddressOf(credentialId),
    });
    return async (challenge) => {
      const assertion = await identity.prove(challenge, passkeyPublicKey);
      SmartWallet.confirmed.add(this.address);
      return assertion;
    };
  }

  private async walletAddressOf(credentialId: Uint8Array): Promise<string> {
    return (await soroban.read(network.factory, 'wallet_address', [xdr.ScVal.scvBytes(credentialId)])) as string;
  }

  private async requireWithdraw(call: SponsoredCall, currency: PaymentCurrency, shares: bigint): Promise<void> {
    const minimum = call.requireWithdrawal({ from: this.address, vault: Savings.vault(currency), shares });
    if (minimum < Holdings.floorOf(await this.valueOf(currency, shares))) {
      throw new Error('The withdrawal minimum is too low');
    }
  }

  private async savingsBalance(currency: PaymentCurrency): Promise<SavingsBalance> {
    const shares = await soroban.balance(Savings.vault(currency), this.address);
    const value = shares === 0n ? 0n : await this.valueOf(currency, shares);
    return { currency, shares, value };
  }

  private async valueOf(currency: PaymentCurrency, shares: bigint): Promise<bigint> {
    const [value] = (await soroban.read(Savings.vault(currency), 'get_asset_amounts_per_shares', [
      i128(shares),
    ])) as bigint[];
    return value;
  }
}
