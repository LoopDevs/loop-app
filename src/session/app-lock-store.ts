import * as SecureStore from 'expo-secure-store';

const enabledKey = 'appLock.enabled';

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
