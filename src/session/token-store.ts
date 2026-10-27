import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { InstallScopedToken } from '@/session/install-scoped-token';

const refreshToken = new InstallScopedToken(
  {
    getItem: (key) => SecureStore.getItemAsync(key),
    setItem: (key, value) => SecureStore.setItemAsync(key, value),
    removeItem: (key) => SecureStore.deleteItemAsync(key),
  },
  AsyncStorage,
  'ctx.refreshToken',
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
    return task();
  },
};
