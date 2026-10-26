import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { loopEnvironment } from '@/environment';
import { DeviceKey, type DeviceKeyStorage } from '@/wallet/device-key';

const biometricOptions: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  authenticationPrompt: 'Approve with Face ID',
};
const biometricsHelp: Partial<Record<typeof Platform.OS, string>> = {
  ios: 'Set up Face ID or Touch ID in Settings, or unlock it with your passcode, then try again.',
  android: 'Add a fingerprint in Settings, then try again.',
};

const secureStorage: DeviceKeyStorage = {
  read(name, biometric) {
    return SecureStore.getItemAsync(loopEnvironment.storageKey(name), biometric ? biometricOptions : undefined);
  },
  write(name, value, biometric) {
    return SecureStore.setItemAsync(
      loopEnvironment.storageKey(name),
      value,
      biometric ? biometricOptions : undefined,
    );
  },
  remove(name) {
    return SecureStore.deleteItemAsync(loopEnvironment.storageKey(name));
  },
};

export const deviceSigner = {
  publicKey(userId: string): Promise<string | null> {
    return new DeviceKey(secureStorage, userId).publicKey();
  },

  async create(userId: string): Promise<string> {
    if (!SecureStore.canUseBiometricAuthentication()) {
      throw new Error(biometricsHelp[Platform.OS] ?? biometricsHelp.ios);
    }
    return new DeviceKey(secureStorage, userId).create();
  },

  sign(userId: string, digest: Uint8Array): Promise<string> {
    return new DeviceKey(secureStorage, userId).sign(digest);
  },
};
