import AsyncStorage from '@react-native-async-storage/async-storage';

import { loopEnvironment } from '@/environment';
import { InstallScopedToken } from '@/session/install-scoped-token';
import { secureTokenStorage } from '@/session/secure-token-storage';
import { StoredSessionText, type StoredSession } from '@/session/stored-session';
import { holdCriticalReload } from '@/updates/update-checker';

const storedSession = new InstallScopedToken(
  secureTokenStorage,
  AsyncStorage,
  loopEnvironment.storageKey('ctx.refreshToken'),
);

export const tokenStore = {
  async readSession(): Promise<StoredSession | null> {
    return StoredSessionText.read(await storedSession.read());
  },
  writeSession(session: StoredSession): Promise<void> {
    return storedSession.write(StoredSessionText.write(session));
  },
  clear(): Promise<void> {
    return storedSession.clear();
  },
  exclusive<T>(task: () => Promise<T>): Promise<T> {
    return holdCriticalReload(task);
  },
};
