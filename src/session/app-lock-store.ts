import * as SecureStore from 'expo-secure-store';

import { loopEnvironment } from '@/environment';

const enabledKey = loopEnvironment.storageKey('appLock.enabled');

export const appLockStore = {
  async readEnabled(): Promise<boolean> {
    return (await SecureStore.getItemAsync(enabledKey)) === 'true';
  },
  writeEnabled(): Promise<void> {
    return SecureStore.setItemAsync(enabledKey, 'true');
  },
  clear(): Promise<void> {
    return SecureStore.deleteItemAsync(enabledKey);
  },
};
