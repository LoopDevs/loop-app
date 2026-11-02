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
  private readonly ownerOf: (accessToken: string) => string;
  private storedRefreshToken: string | null = null;
  private refusedRefreshToken: string | null = null;
  private owner: string | null = null;

  constructor(send: Send, store: RefreshTokenStore, ownerOf: (accessToken: string) => string) {
    this.send = send;
    this.store = store;
    this.ownerOf = ownerOf;
  }

  async hasSession(): Promise<boolean> {
    if (this.session.token() !== null) {
      return true;
    }
    const stored = await this.store.readRefreshToken();
    return stored !== null && stored !== this.refusedRefreshToken;
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

  replacement(rejected: string): Promise<string> {
    this.session.reject(this.session.current(), rejected);
    return this.requireAccessToken();
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
    const generation = this.beginSession();
    await this.session.refreshOnce(generation, async () =>
      (await this.storeTokens(generation, tokens)) ? tokens.accessToken : null,
    );
  }

  async clearSession(): Promise<void> {
    this.beginSession();
    this.storedRefreshToken = null;
    await this.store.clear();
    this.notifySessionEnd();
  }

  onSessionEnd(listener: () => void): () => void {
    this.sessionEndListeners.add(listener);
    return () => {
      this.sessionEndListeners.delete(listener);
    };
  }

  private beginSession(): number {
    this.owner = null;
    this.refusedRefreshToken = null;
    return this.session.begin();
  }

  private refuse(refreshToken: string): void {
    this.refusedRefreshToken = refreshToken;
    this.session.begin();
    this.notifySessionEnd();
  }

  private ownerOrNull(accessToken: string): string | null {
    try {
      return this.ownerOf(accessToken) || null;
    } catch {
      return null;
    }
  }

  private notifySessionEnd(): void {
    for (const listener of this.sessionEndListeners) {
      listener();
    }
  }

  private async replacementFor(generation: number, rejected: string, error: unknown): Promise<string> {
    if (!SessionAuth.tokenRefused(error) || !this.session.reject(generation, rejected)) {
      throw error;
    }
    const refreshed = await this.accessToken();
    if (!refreshed || !this.session.isCurrent(generation)) {
      throw error;
    }
    return refreshed;
  }

  private async rotatedElsewhere(error: unknown): Promise<boolean> {
    if (!SessionAuth.tokenRefused(error)) {
      return false;
    }
    const stored = await this.store.exclusive(() => this.store.readRefreshToken());
    return stored !== null && stored !== this.storedRefreshToken;
  }

  private static tokenRefused(error: unknown): boolean {
    return error instanceof CtxError && error.refusesToken();
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
    if (!refreshToken || refreshToken === this.refusedRefreshToken || !this.session.isCurrent(generation)) {
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
    if (!this.session.isCurrent(generation)) {
      return false;
    }
    const owner = this.ownerOrNull(tokens.accessToken);
    if (owner === null || (this.owner !== null && owner !== this.owner)) {
      this.refuse(tokens.refreshToken);
      return false;
    }
    this.owner = owner;
    return this.session.adopt(generation, tokens.accessToken);
  }
}
