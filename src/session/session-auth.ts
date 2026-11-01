import { CtxError } from '../ctx/ctx-error.ts';
import { Deadline } from '../ctx/deadline.ts';
import { SessionTokens } from './session-tokens.ts';

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

export type SendOptions = {
  headers?: Record<string, string>;
  reportServiceState?: boolean;
  timeoutMs?: number;
};

export type Send = <T>(method: string, path: string, body?: unknown, options?: SendOptions) => Promise<T>;

export type RefreshTokenStore = {
  readRefreshToken(): Promise<string | null>;
  writeRefreshToken(token: string): Promise<void>;
  clear(): Promise<void>;
  exclusive<T>(task: () => Promise<T>): Promise<T>;
};

export class SessionAuth {
  private readonly session = new SessionTokens();
  private readonly send: Send;
  private readonly store: RefreshTokenStore;
  private readonly sessionEndListeners = new Set<() => void>();
  private storedRefreshToken: string | null = null;

  constructor(send: Send, store: RefreshTokenStore) {
    this.send = send;
    this.store = store;
  }

  async hasSession(): Promise<boolean> {
    return this.session.token() !== null || (await this.store.readRefreshToken()) !== null;
  }

  async accessToken(): Promise<string | null> {
    return this.session.token() ?? this.refresh();
  }

  async requireAccessToken(): Promise<string> {
    const accessToken = await this.accessToken();
    if (!accessToken) {
      throw new Error('Sign in first');
    }
    return accessToken;
  }

  async sessionRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    reportServiceState = true,
    headers: Record<string, string> = {},
  ): Promise<T> {
    const generation = this.session.current();
    const request = (accessToken: string) =>
      this.authorized<T>(accessToken, method, path, body, reportServiceState, headers);
    const accessToken = await this.requireAccessToken();
    try {
      return await request(accessToken);
    } catch (error) {
      const refreshed = await this.replacementFor(generation, accessToken, error);
      try {
        return await request(refreshed);
      } catch (retryError) {
        if (!(await this.rotatedElsewhere(retryError))) {
          throw retryError;
        }
        return request(await this.replacementFor(generation, refreshed, retryError));
      }
    }
  }

  async startSession(tokens: TokenPair): Promise<void> {
    const generation = this.session.begin();
    await this.session.refreshOnce(generation, async () =>
      (await this.storeTokens(generation, tokens)) ? tokens.accessToken : null,
    );
  }

  async clearSession(): Promise<void> {
    this.session.begin();
    this.storedRefreshToken = null;
    await this.store.clear();
    for (const listener of this.sessionEndListeners) {
      listener();
    }
  }

  onSessionEnd(listener: () => void): () => void {
    this.sessionEndListeners.add(listener);
    return () => {
      this.sessionEndListeners.delete(listener);
    };
  }

  private async replacementFor(generation: number, rejected: string, error: unknown): Promise<string> {
    if (!SessionAuth.isUnauthorized(error) || !this.session.reject(generation, rejected)) {
      throw error;
    }
    const refreshed = await this.accessToken();
    if (!refreshed || !this.session.isCurrent(generation)) {
      throw error;
    }
    return refreshed;
  }

  private async rotatedElsewhere(error: unknown): Promise<boolean> {
    if (!SessionAuth.isUnauthorized(error)) {
      return false;
    }
    const stored = await this.store.exclusive(() => this.store.readRefreshToken());
    return stored !== null && stored !== this.storedRefreshToken;
  }

  private static isUnauthorized(error: unknown): boolean {
    return error instanceof CtxError && error.status === 401;
  }

  private authorized<T>(
    accessToken: string,
    method: string,
    path: string,
    body: unknown,
    reportServiceState: boolean,
    headers: Record<string, string>,
  ): Promise<T> {
    return this.send<T>(method, path, body, {
      headers: { ...headers, Authorization: `Bearer ${accessToken}` },
      reportServiceState,
    });
  }

  private refresh(): Promise<string | null> {
    const generation = this.session.current();
    return this.session.refreshOnce(generation, () =>
      this.store.exclusive(() => this.rotateRefreshToken(generation)),
    );
  }

  private async rotateRefreshToken(generation: number): Promise<string | null> {
    const refreshToken = await this.store.readRefreshToken();
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

  private async sendRefreshToken(refreshToken: string): Promise<TokenPair> {
    const request = () =>
      this.send<TokenPair>('POST', '/refresh-token', { refreshToken }, { timeoutMs: Deadline.refreshMs });
    try {
      return await request();
    } catch (error) {
      if (error instanceof CtxError) {
        throw error;
      }
      return request();
    }
  }

  private async storeTokens(generation: number, tokens: TokenPair): Promise<boolean> {
    if (!this.session.isCurrent(generation)) {
      return false;
    }
    await this.store.writeRefreshToken(tokens.refreshToken);
    this.storedRefreshToken = tokens.refreshToken;
    return this.session.adopt(generation, tokens.accessToken);
  }
}
