import * as SecureStore from 'expo-secure-store';

const refreshTokenKey = 'ctx.refreshToken';

export const tokenStore = {
  readRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(refreshTokenKey);
  },
  writeRefreshToken(token: string): Promise<void> {
    return SecureStore.setItemAsync(refreshTokenKey, token);
  },
  clear(): Promise<void> {
    return SecureStore.deleteItemAsync(refreshTokenKey);
  },
  exclusive<T>(task: () => Promise<T>): Promise<T> {
    return task();
  },
};
