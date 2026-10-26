import { Account } from '@/ctx/account';
import { CtxError } from '@/ctx/ctx-error';
import { ctxReportMessage } from '@/ctx/ctx-report';
import { Deadline } from '@/ctx/deadline';
import { Merchant } from '@/ctx/merchant';
import type { PayoutJson } from '@/ctx/payout';
import { Profile } from '@/ctx/profile';
import { blockingServiceState, type BlockingServiceState } from '@/ctx/service-state';
import { loopEnvironment } from '@/environment';
import { errorReporting } from '@/ops/error-reporting';
import { SessionAuth, type SendOptions, type TokenPair } from '@/session/session-auth';
import {
  oauthLoginBody,
  signInRefusalMessage,
  type SignInMethod,
  type SocialProvider,
} from '@/session/social-sign-in';
import { tokenStore } from '@/session/token-store';
import type { PaymentCurrency } from '@/stellar/network';

export { CtxError };

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
  order?: 'name';
  page?: number;
  perPage?: number;
  category?: string;
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

export type SponsoredResult = {
  hash: string;
  status: string;
  error?: string;
};

class CtxClient {
  private readonly auth = new SessionAuth(this.send.bind(this), tokenStore);
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

  hasSession(): Promise<boolean> {
    return this.auth.hasSession();
  }

  async requestCode(email: string): Promise<void> {
    await this.signInRequest('email', '/login', { email });
  }

  async verifyCode(email: string, code: string): Promise<void> {
    await this.auth.startSession(await this.send<TokenPair>('POST', '/verify-email', { email, code }));
  }

  async signInWithOAuth(provider: SocialProvider, idToken: string): Promise<void> {
    await this.auth.startSession(
      await this.signInRequest<TokenPair>(provider, '/login/oauth', oauthLoginBody(provider, idToken)),
    );
  }

  async isSignedIn(): Promise<boolean> {
    return (await this.auth.accessToken()) !== null;
  }

  async signOut(): Promise<void> {
    await this.auth.sessionRequest('POST', '/logout', undefined, false).catch(() => undefined);
    await this.auth.clearSession();
  }

  async userId(): Promise<string> {
    return this.userIdFrom(await this.auth.requireAccessToken());
  }

  async me(): Promise<Profile> {
    return Profile.fromMe(await this.auth.sessionRequest<MeJson>('GET', '/me'));
  }

  updateUser(update: UserUpdate): Promise<UserJson> {
    return this.userRequest('PUT', '', update);
  }

  async account(): Promise<Account> {
    return new Account(await this.userRequest<AccountJson>('GET', '/account'));
  }

  async merchants(merchantQuery: MerchantQuery): Promise<MerchantPage> {
    const query = Merchant.listQuery(merchantQuery);
    const { result, pagination } = await this.auth.sessionRequest<{
      result: MerchantJson[] | null;
      pagination: Pagination;
    }>('GET', `/merchants?${query}`);
    return { result: (result ?? []).map((json) => new Merchant(json)), pagination };
  }

  async merchant(idOrSlug: string): Promise<Merchant> {
    const json = await this.auth.sessionRequest<MerchantJson>('GET', `/merchants/${encodeURIComponent(idOrSlug)}`);
    return new Merchant(json);
  }

  orderGiftCard(order: GiftCardOrderIn): Promise<GiftCard> {
    const body: GiftCardOrderBody = { ...order, rewardType: 'cashback' };
    return this.auth.sessionRequest('POST', '/gift-cards', body);
  }

  giftCard(id: string): Promise<GiftCard> {
    return this.auth.sessionRequest('GET', `/gift-cards/${id}`);
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
    const { result, pagination } = await this.auth.sessionRequest<{
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

  private async userRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    const accessToken = await this.auth.requireAccessToken();
    return this.auth.sessionRequest<T>(method, `/users/${this.userIdFrom(accessToken)}${path}`, body);
  }

  private async signInRequest<T>(method: SignInMethod, path: string, body: unknown): Promise<T> {
    try {
      return await this.send<T>('POST', path, body);
    } catch (error) {
      const refusal = error instanceof CtxError ? signInRefusalMessage(method, error.errorName()) : null;
      throw refusal ? new Error(refusal, { cause: error }) : error;
    }
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

export const ctx = new CtxClient(loopEnvironment.ctxApiUrl, process.env.EXPO_PUBLIC_CTX_CLIENT_ID ?? '');
