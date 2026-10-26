import { rateLimitedMessage } from '@/ctx/payment-state';
import { tokenStore } from '@/session/token-store';
import type { PaymentCurrency } from '@/stellar/network';

type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

export type WalletLink = {
  id: string;
  chain: string;
  address: string;
  sponsored: boolean;
  status: string;
};

export type DeployWalletIn = {
  credentialId: string;
  passkeyPublicKey: string;
  devicePublicKey: string;
};

export type SmartWalletIntent =
  | { intent: 'vault_withdraw'; currency: string; shares: string }
  | { intent: 'pay'; paymentId: string };

export type BuiltTransaction = {
  transaction: string;
  digest: string;
  contextRuleIds: number[];
  expiryLedger: number;
};

export type SignedTransaction = {
  transaction: string;
  signature: string;
  devicePublicKey: string;
};

export type Merchant = {
  id: string;
  name: string;
  currency: string;
  denominationType: 'min-max' | 'min-max-major' | 'fixed';
  denominations: string[];
  logoUrl?: string;
  userDiscount: number;
};

export type GiftCardOrderIn = {
  merchantId: string;
  fiatAmount: string;
  fiatCurrency: string;
  cryptoCurrency: PaymentCurrency;
};

export type GiftCard = {
  id: string;
  status: 'unpaid' | 'paid' | 'fulfilled' | 'rejected' | 'refunded' | 'expired';
  merchantId: string;
  merchantName: string;
  created: string;
  cardFiatAmount: string;
  cardFiatCurrency: string;
  paymentId: string;
  paymentCryptoAmount?: string;
  paymentCryptoCurrency?: string;
  paymentCryptoTxId?: string;
  paymentUrlExpiration?: string;
  number?: string;
  pin?: string;
  redeemUrl?: string;
  barcodeUrl?: string;
};

export type SponsoredResult = {
  hash: string;
  status: string;
  error?: string;
};

export class CtxError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(status === 429 ? rateLimitedMessage : `CTX ${status}: ${body}`);
  }

  errorName(): string | undefined {
    return this.bodyField('error');
  }

  bodyField(name: string): string | undefined {
    try {
      const parsed: unknown = JSON.parse(this.body);
      if (parsed && typeof parsed === 'object') {
        const value = (parsed as Record<string, unknown>)[name];
        return typeof value === 'string' ? value : undefined;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }
}

class CtxClient {
  private accessToken: string | null = null;
  private refreshInFlight: Promise<string | null> | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly clientId: string,
  ) {}

  async requestCode(email: string): Promise<void> {
    await this.send('POST', '/login', { email });
  }

  async verifyCode(email: string, code: string): Promise<void> {
    const tokens = await this.send<TokenPair>('POST', '/verify-email', { email, code });
    await this.storeTokens(tokens);
  }

  async isSignedIn(): Promise<boolean> {
    return (await this.getAccessToken()) !== null;
  }

  async signOut(): Promise<void> {
    this.accessToken = null;
    await tokenStore.clear();
  }

  async merchants(name: string): Promise<Merchant[]> {
    const query = new URLSearchParams({ enabled: '1', perPage: '20', order: 'name' });
    if (name.trim()) {
      query.set('name', name.trim());
    }
    const { result } = await this.send<{ result: Merchant[] }>('GET', `/merchants?${query}`);
    return result;
  }

  orderGiftCard(order: GiftCardOrderIn): Promise<GiftCard> {
    return this.sessionRequest('POST', '/gift-cards', order);
  }

  giftCard(id: string): Promise<GiftCard> {
    return this.sessionRequest('GET', `/gift-cards/${id}`);
  }

  async giftCards(): Promise<GiftCard[]> {
    const query = new URLSearchParams({ perPage: '50', order: '-created' });
    const { result } = await this.sessionRequest<{ result: GiftCard[] | null }>(
      'GET',
      `/gift-cards?${query}`,
    );
    return result ?? [];
  }

  async activeGiftCard(): Promise<GiftCard | null> {
    const query = new URLSearchParams({ status: 'unpaid,paid', perPage: '5', order: '-created' });
    const { result } = await this.sessionRequest<{ result: GiftCard[] | null }>(
      'GET',
      `/gift-cards?${query}`,
    );
    const newest = result?.[0];
    return newest ? this.giftCard(newest.id) : null;
  }

  async wallets(): Promise<WalletLink[]> {
    const { result } = await this.userRequest<{ result: WalletLink[] }>('GET', '/wallets');
    return result;
  }

  deployWallet(body: DeployWalletIn): Promise<WalletLink> {
    return this.userRequest('POST', '/wallets/deploy', body);
  }

  buildTransaction(walletId: string, intent: SmartWalletIntent): Promise<BuiltTransaction> {
    return this.userRequest('POST', `/wallets/${walletId}/stellar/transaction`, intent);
  }

  sponsorTransaction(
    walletId: string,
    intent: SmartWalletIntent,
    signed: SignedTransaction,
  ): Promise<SponsoredResult> {
    return this.userRequest('POST', `/wallets/${walletId}/stellar/sponsor`, { ...intent, ...signed });
  }

  private async getAccessToken(): Promise<string | null> {
    if (this.accessToken) {
      return this.accessToken;
    }
    return this.refresh();
  }

  private async userRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    const accessToken = await this.requireAccessToken();
    return this.sessionRequest<T>(method, `/users/${this.userIdFrom(accessToken)}${path}`, body);
  }

  private async requireAccessToken(): Promise<string> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      throw new Error('Sign in first');
    }
    return accessToken;
  }

  private async sessionRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    const accessToken = await this.requireAccessToken();
    try {
      return await this.authorized<T>(accessToken, method, path, body);
    } catch (error) {
      if (!(error instanceof CtxError) || error.status !== 401) {
        throw error;
      }
      this.accessToken = null;
      const refreshed = await this.refresh();
      if (!refreshed) {
        throw error;
      }
      return this.authorized<T>(refreshed, method, path, body);
    }
  }

  private authorized<T>(accessToken: string, method: string, path: string, body?: unknown): Promise<T> {
    return this.send<T>(method, path, body, {
      Authorization: `Bearer ${accessToken}`,
    });
  }

  private refresh(): Promise<string | null> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.rotateRefreshToken().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  private async rotateRefreshToken(): Promise<string | null> {
    const refreshToken = await tokenStore.readRefreshToken();
    if (!refreshToken) {
      return null;
    }
    try {
      const tokens = await this.send<TokenPair>('POST', '/refresh-token', { refreshToken });
      await this.storeTokens(tokens);
      return tokens.accessToken;
    } catch (error) {
      if (error instanceof CtxError && error.status === 401) {
        await this.signOut();
        return null;
      }
      throw error;
    }
  }

  private async storeTokens(tokens: TokenPair): Promise<void> {
    await tokenStore.writeRefreshToken(tokens.refreshToken);
    this.accessToken = tokens.accessToken;
  }

  private userIdFrom(accessToken: string): string {
    const payload = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return (JSON.parse(atob(payload)) as { tid: string }).tid;
  }

  private async send<T>(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': this.clientId,
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new CtxError(response.status, text);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }
}

export const ctx = new CtxClient(
  process.env.EXPO_PUBLIC_CTX_API_URL ?? '',
  process.env.EXPO_PUBLIC_CTX_CLIENT_ID ?? '',
);
