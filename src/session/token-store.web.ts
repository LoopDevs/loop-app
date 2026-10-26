const refreshTokenKey = 'ctx.refreshToken';
const refreshLockName = 'ctx.refreshToken';

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
  exclusive<T>(task: () => Promise<T>): Promise<T> {
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
    return locks ? locks.request(refreshLockName, task) : task();
  },
};
