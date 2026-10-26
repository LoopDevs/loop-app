import { Account } from '@/ctx/account';
import { ctxReportMessage } from '@/ctx/ctx-report';
import { Deadline, RequestTimeoutError } from '@/ctx/deadline';
import { Merchant } from '@/ctx/merchant';
import { rateLimitedMessage } from '@/ctx/payment-state';
import type { PayoutJson } from '@/ctx/payout';
import { Profile } from '@/ctx/profile';
import {
  blockingServiceState,
  serviceState,
  serviceStateMessages,
  type BlockingServiceState,
} from '@/ctx/service-state';
import { errorReporting } from '@/ops/error-reporting';
import {
  oauthLoginBody,
  signInRefusalMessage,
  type SignInMethod,
  type SocialProvider,
} from '@/session/social-sign-in';
import { SessionTokens } from '@/session/session-tokens';
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
  paymentStatus: 'unpaid' | 'paid' | 'error' | 'refunded' | 'cancelled' | 'expired';
  paymentMethod: string;
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

export type CashbackDestination = 'account' | 'savings';

export type OAuthIdentityJson = {
  provider: string;
};

export type UserJson = {
  id: string;
  email?: string;
  country?: string;
  stableCurrency?: string;
  cashbackDestination?: CashbackDestination;
  oauthIdentities?: OAuthIdentityJson[];
};

export type MeJson = {
  user: UserJson;
  company?: {
    countries?: string[];
    stableCurrencies?: string[];
  };
};

export type UserUpdate =
  | { country: string }
  | { stableCurrency: string }
  | { cashbackDestination: CashbackDestination };

export type BalanceJson = {
  currency: string;
  amount: string;
  estimates?: Record<string, string>;
};

export type AccountJson = {
  wallet: BalanceJson[] | null;
  payouts: PayoutJson[] | null;
};

export type ServiceStatus = {
  maintenance: boolean;
};

type ServiceStateListener = (state: BlockingServiceState) => void;

type SendOptions = {
  headers?: Record<string, string>;
  reportServiceState?: boolean;
  timeoutMs?: number;
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
    super(CtxError.displayMessage(status, body));
  }

  errorName(): string | undefined {
    return this.bodyField('error');
  }

  bodyField(name: string): string | undefined {
    return CtxError.field(this.body, name);
  }

  private static displayMessage(status: number, body: string): string {
    if (status === 429) {
      return rateLimitedMessage;
    }
    const state = serviceState(CtxError.field(body, 'error'));
    return state ? serviceStateMessages[state] : `CTX ${status}: ${body}`;
  }

  private static field(body: string, name: string): string | undefined {
    try {
      const parsed: unknown = JSON.parse(body);
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
  private readonly session = new SessionTokens();
  private serviceStateListener: ServiceStateListener | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly clientId: string,
  ) {}

  onServiceState(listener: ServiceStateListener): () => void {
    this.serviceStateListener = listener;
    return () => {
      if (this.serviceStateListener === listener) {
        this.serviceStateListener = null;
      }
    };
  }

  async status(): Promise<ServiceStatus> {
    const { maintenance } = await this.send<{ maintenance?: boolean }>('GET', '/status');
    return { maintenance: maintenance === true };
  }

  async hasSession(): Promise<boolean> {
    return this.session.token() !== null || (await tokenStore.readRefreshToken()) !== null;
  }

  async requestCode(email: string): Promise<void> {
    await this.signInRequest('email', '/login', { email });
  }

  async verifyCode(email: string, code: string): Promise<void> {
    await this.startSession(await this.send<TokenPair>('POST', '/verify-email', { email, code }));
  }

  async signInWithOAuth(provider: SocialProvider, idToken: string): Promise<void> {
    await this.startSession(
      await this.signInRequest<TokenPair>(provider, '/login/oauth', oauthLoginBody(provider, idToken)),
    );
  }

  async isSignedIn(): Promise<boolean> {
    return (await this.getAccessToken()) !== null;
  }

  async signOut(): Promise<void> {
    await this.sessionRequest('POST', '/logout', undefined, false).catch(() => undefined);
    await this.clearSession();
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
    return new Account(await this.userRequest<AccountJson>('GET', '/account'));
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
    return this.session.token() ?? this.refresh();
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

  private async sessionRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    reportServiceState = true,
  ): Promise<T> {
    const generation = this.session.current();
    const accessToken = await this.requireAccessToken();
    try {
      return await this.authorized<T>(accessToken, method, path, body, reportServiceState);
    } catch (error) {
      if (!(error instanceof CtxError) || error.status !== 401) {
        throw error;
      }
      if (!this.session.reject(generation, accessToken)) {
        throw error;
      }
      const refreshed = await this.getAccessToken();
      if (!refreshed || !this.session.isCurrent(generation)) {
        throw error;
      }
      return this.authorized<T>(refreshed, method, path, body, reportServiceState);
    }
  }

  private authorized<T>(
    accessToken: string,
    method: string,
    path: string,
    body: unknown,
    reportServiceState: boolean,
  ): Promise<T> {
    return this.send<T>(method, path, body, {
      headers: { Authorization: `Bearer ${accessToken}` },
      reportServiceState,
    });
  }

  private refresh(): Promise<string | null> {
    const generation = this.session.current();
    return this.session.refreshOnce(generation, () =>
      tokenStore.exclusive(() => this.rotateRefreshToken(generation)),
    );
  }

  private async rotateRefreshToken(generation: number): Promise<string | null> {
    const refreshToken = await tokenStore.readRefreshToken();
    if (!refreshToken || !this.session.isCurrent(generation)) {
      return null;
    }
    try {
      const tokens = await this.sendRefreshToken(refreshToken);
      return (await this.storeTokens(generation, tokens)) ? tokens.accessToken : null;
    } catch (error) {
      if (!this.session.isCurrent(generation)) {
        return null;
      }
      if (error instanceof CtxError && error.status === 401) {
        await this.clearSession();
        return null;
      }
      throw error;
    }
  }

  private async clearSession(): Promise<void> {
    this.session.begin();
    await tokenStore.clear();
  }

  private async sendRefreshToken(refreshToken: string): Promise<TokenPair> {
    const request = () =>
      this.send<TokenPair>('POST', '/refresh-token', { refreshToken }, { timeoutMs: Deadline.refreshMs });
    try {
      return await request();
    } catch (error) {
      if (!(error instanceof RequestTimeoutError)) {
        throw error;
      }
      return request();
    }
  }

  private async startSession(tokens: TokenPair): Promise<void> {
    const generation = this.session.begin();
    await this.session.refreshOnce(generation, async () =>
      (await this.storeTokens(generation, tokens)) ? tokens.accessToken : null,
    );
  }

  private async signInRequest<T>(method: SignInMethod, path: string, body: unknown): Promise<T> {
    try {
      return await this.send<T>('POST', path, body);
    } catch (error) {
      const refusal = error instanceof CtxError ? signInRefusalMessage(method, error.errorName()) : null;
      throw refusal ? new Error(refusal, { cause: error }) : error;
    }
  }

  private async storeTokens(generation: number, tokens: TokenPair): Promise<boolean> {
    if (!this.session.isCurrent(generation)) {
      return false;
    }
    await tokenStore.writeRefreshToken(tokens.refreshToken);
    return this.session.adopt(generation, tokens.accessToken);
  }

  private userIdFrom(accessToken: string): string {
    const payload = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return (JSON.parse(atob(payload)) as { tid: string }).tid;
  }

  private async send<T>(
    method: string,
    path: string,
    body?: unknown,
    { headers = {}, reportServiceState = true, timeoutMs = Deadline.requestMs }: SendOptions = {},
  ): Promise<T> {
    const response = await Deadline.run(timeoutMs, async (signal) => {
      const answer = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Id': this.clientId,
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
      return { ok: answer.ok, status: answer.status, text: await answer.text() };
    });
    const { text } = response;
    if (!response.ok) {
      const error = new CtxError(response.status, text);
      const blocking = blockingServiceState(error.errorName());
      if (blocking && reportServiceState) {
        this.serviceStateListener?.(blocking);
      }
      const report = ctxReportMessage(response.status, error.errorName());
      if (report) {
        errorReporting.reportMessage(report);
      }
      throw error;
    }
    return (text ? JSON.parse(text) : {}) as T;
  }
}

export const ctx = new CtxClient(
  process.env.EXPO_PUBLIC_CTX_API_URL ?? '',
  process.env.EXPO_PUBLIC_CTX_CLIENT_ID ?? '',
);
