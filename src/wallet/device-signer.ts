import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { errorReporting } from '@/ops/error-reporting';
import { DeviceKey, IdentityNotConfirmed, type DeviceKeyStorage } from '@/wallet/device-key';
import { reportingSigningFailure } from '@/wallet/signing-report';

const thisDeviceOnly: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const biometricOptions: SecureStore.SecureStoreOptions = {
  ...thisDeviceOnly,
  requireAuthentication: true,
  authenticationPrompt: 'Confirm it’s you',
};
const biometricsHelp: Partial<Record<typeof Platform.OS, string>> = {
  ios: 'Set up Face ID or Touch ID in Settings, then try again.',
  android: 'Add a fingerprint in Settings, then try again.',
};

const secureStorage: DeviceKeyStorage = {
  async read(name, biometric) {
    if (!biometric) {
      return SecureStore.getItemAsync(name);
    }
    return SecureStore.getItemAsync(name, biometricOptions).catch((error: unknown) => {
      throw IdentityNotConfirmed.from(error);
    });
  },
  write(name, value, biometric) {
    return SecureStore.setItemAsync(name, value, biometric ? biometricOptions : thisDeviceOnly);
  },
  remove(name) {
    return SecureStore.deleteItemAsync(name);
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
    return reportingSigningFailure('device key', errorReporting.reportError, () =>
      new DeviceKey(secureStorage, userId).create(),
    );
  },

  sign(userId: string, digest: Uint8Array): Promise<string> {
    return reportingSigningFailure('device key', errorReporting.reportError, () =>
      new DeviceKey(secureStorage, userId).sign(digest),
    );
  },
};
