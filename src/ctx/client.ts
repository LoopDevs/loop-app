import { Merchant } from '@/ctx/merchant';
import { rateLimitedMessage } from '@/ctx/payment-state';
import { Payout, type PayoutJson } from '@/ctx/payout';
import { Profile } from '@/ctx/profile';
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

export type MerchantLinkJson = {
  userDiscountOverride?: boolean;
  userDiscountBasisPoints?: number;
};

export type MerchantJson = {
  id: string;
  slug: string;
  name: string;
  country: string;
  currency: string;
  denominationType: 'min-max' | 'min-max-major' | 'fixed';
  denominations: string[];
  logoUrl?: string;
  cardImageUrl?: string;
  website?: string;
  info?: GiftCardInfo;
  userDiscount: number;
  link?: MerchantLinkJson;
};

export type MerchantQuery = {
  country: string;
  name?: string;
  ids?: string[];
  order?: 'name' | '-discount';
  page?: number;
  perPage?: number;
};

export type MerchantPage = {
  result: Merchant[];
  pagination: Pagination;
};

export type GiftCardOrderIn = {
  merchantId: string;
  fiatAmount: string;
  fiatCurrency: string;
  cryptoCurrency: PaymentCurrency;
};

type GiftCardOrderBody = GiftCardOrderIn & {
  rewardType: 'cashback';
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
  paymentMethod?: 'crypto' | 'plaid-uk-eu';
  paymentCryptoAmount?: string;
  paymentCryptoCurrency?: string;
  paymentCryptoTxId?: string;
  paymentUrlExpiration?: string;
  number?: string;
  pin?: string;
  redeemUrl?: string;
  redeemUrlChallenge?: string;
  redeemType?: 'barcode' | 'url';
  barcodeUrl?: string;
  barcodeType?: string;
  info?: GiftCardInfo;
  cashbackAmount?: string;
  cashbackCurrency?: string;
  cashbackCredited?: boolean;
  cashbackReversed?: boolean;
};

export type GiftCardInfo = {
  intro?: string;
  description?: string;
  instructions?: string;
  terms?: string;
};

export type Pagination = {
  page: number;
  pages: number;
  perPage: number;
  total: number;
};

export type GiftCardPage = {
  result: GiftCard[];
  pagination: Pagination;
};

export type GiftCardQuery = {
  merchantId?: string;
  status?: GiftCard['status'][];
  notStatus?: GiftCard['status'][];
  order?: string;
  page?: number;
  perPage?: number;
};

export type UserJson = {
  id: string;
  country?: string;
  stableCurrency?: string;
};

export type MeJson = {
  user: UserJson;
  company?: {
    countries?: string[];
    stableCurrencies?: string[];
  };
};

export type UserUpdate = { country: string } | { stableCurrency: string };

export type BalanceJson = {
  currency: string;
  amount: string;
  estimates?: Record<string, string>;
};

type AccountJson = {
  wallet: BalanceJson[] | null;
  payouts: PayoutJson[] | null;
};

export type Account = {
  wallet: BalanceJson[];
  payouts: Payout[];
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

  async userId(): Promise<string> {
    return this.userIdFrom(await this.requireAccessToken());
  }

  async me(): Promise<Profile> {
    return Profile.fromMe(await this.sessionRequest<MeJson>('GET', '/me'));
  }

  updateUser(update: UserUpdate): Promise<UserJson> {
    return this.userRequest('PUT', '', update);
  }

  async account(): Promise<Account> {
    const json = await this.userRequest<AccountJson>('GET', '/account');
    return {
      wallet: json.wallet ?? [],
      payouts: (json.payouts ?? []).map((payout) => new Payout(payout)),
    };
  }

  async merchants({ country, name, ids, order = 'name', page, perPage }: MerchantQuery): Promise<MerchantPage> {
    const query = new URLSearchParams({ enabled: '1', order, country });
    const pattern = Merchant.searchPattern(name ?? '');
    if (pattern) {
      query.set('name', pattern);
    }
    if (ids) {
      query.set('ids', ids.map((id) => Merchant.searchPattern(id)).join(','));
    }
    if (page) {
      query.set('page', String(page));
    }
    if (perPage) {
      query.set('perPage', String(perPage));
    }
    const { result, pagination } = await this.sessionRequest<{
      result: MerchantJson[] | null;
      pagination: Pagination;
    }>('GET', `/merchants?${query}`);
    return { result: (result ?? []).map((json) => new Merchant(json)), pagination };
  }

  async merchant(idOrSlug: string): Promise<Merchant> {
    const json = await this.sessionRequest<MerchantJson>('GET', `/merchants/${encodeURIComponent(idOrSlug)}`);
    return new Merchant(json);
  }

  orderGiftCard(order: GiftCardOrderIn): Promise<GiftCard> {
    const body: GiftCardOrderBody = { ...order, rewardType: 'cashback' };
    return this.sessionRequest('POST', '/gift-cards', body);
  }

  giftCard(id: string): Promise<GiftCard> {
    return this.sessionRequest('GET', `/gift-cards/${id}`);
  }

  async giftCards({ merchantId, status, notStatus, order, page, perPage }: GiftCardQuery): Promise<GiftCardPage> {
    const query = new URLSearchParams();
    if (merchantId) {
      query.set('merchantId', Merchant.searchPattern(merchantId));
    }
    if (status) {
      query.set('status', status.join(','));
    }
    if (notStatus) {
      query.set('status!', notStatus.join(','));
    }
    if (order) {
      query.set('order', order);
    }
    if (page) {
      query.set('page', String(page));
    }
    if (perPage) {
      query.set('perPage', String(perPage));
    }
    const { result, pagination } = await this.sessionRequest<{
      result: GiftCard[] | null;
      pagination: Pagination;
    }>('GET', `/gift-cards?${query}`);
    return { result: result ?? [], pagination };
  }

  async activeGiftCard(merchantId?: string): Promise<GiftCard | null> {
    const { result } = await this.giftCards({ merchantId, status: ['unpaid', 'paid'], perPage: 5 });
    const newest = result[0];
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
