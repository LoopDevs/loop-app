import AsyncStorage from '@react-native-async-storage/async-storage';

import { InstallScopedToken } from '@/session/install-scoped-token';
import { secureTokenStorage } from '@/session/secure-token-storage';

const refreshToken = new InstallScopedToken(secureTokenStorage, AsyncStorage, 'ctx.refreshToken');

export const tokenStore = {
  readRefreshToken(): Promise<string | null> {
    return refreshToken.read();
  },
  writeRefreshToken(token: string): Promise<void> {
    return refreshToken.write(token);
  },
  clear(): Promise<void> {
    return refreshToken.clear();
  },
  exclusive<T>(task: () => Promise<T>): Promise<T> {
    return task();
  },
};
