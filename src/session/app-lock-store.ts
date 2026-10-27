import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { InstallScopedToken } from '@/session/install-scoped-token';

const enabled = new InstallScopedToken(
  {
    getItem: (key) => SecureStore.getItemAsync(key),
    setItem: (key, value) => SecureStore.setItemAsync(key, value),
    removeItem: (key) => SecureStore.deleteItemAsync(key),
  },
  AsyncStorage,
  'appLock.enabled',
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
