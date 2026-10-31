import AsyncStorage from '@react-native-async-storage/async-storage';

import { loopEnvironment } from '@/environment';
import { InstallScopedToken } from '@/session/install-scoped-token';
import { secureTokenStorage } from '@/session/secure-token-storage';

const enabled = new InstallScopedToken(
  secureTokenStorage,
  AsyncStorage,
  loopEnvironment.storageKey('appLock.enabled'),
);

export const appLockStore = {
  async readEnabled(): Promise<boolean> {
    return (await enabled.read()) === 'true';
  },
  writeEnabled(): Promise<void> {
    return enabled.write('true');
  },
  clear(): Promise<void> {
    return enabled.clear();
  },
};
