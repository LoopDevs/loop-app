const refreshTokenKey = 'ctx.refreshToken';

export const tokenStore = {
  async readRefreshToken(): Promise<string | null> {
    return window.localStorage.getItem(refreshTokenKey);
  },
  async writeRefreshToken(token: string): Promise<void> {
    window.localStorage.setItem(refreshTokenKey, token);
  },
  async clear(): Promise<void> {
    window.localStorage.removeItem(refreshTokenKey);
  },
};
