import AsyncStorage from '@react-native-async-storage/async-storage';

import { loopEnvironment } from '@/environment';
import { InstallScopedToken } from '@/session/install-scoped-token';
import { secureTokenStorage } from '@/session/secure-token-storage';
import { holdCriticalReload } from '@/updates/update-checker';

const refreshToken = new InstallScopedToken(
  secureTokenStorage,
  AsyncStorage,
  loopEnvironment.storageKey('ctx.refreshToken'),
);

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
    return holdCriticalReload(task);
  },
};
