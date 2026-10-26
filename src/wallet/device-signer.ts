import { ed25519 } from '@noble/curves/ed25519';
import { randomBytes } from '@noble/hashes/utils';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { base64 } from '@/wallet/base64';

const secretKey = 'device.signer.secret';
const publicKeyKey = 'device.signer.public';
const biometricOptions: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  authenticationPrompt: 'Approve with Face ID',
};
const biometricsHelp: Partial<Record<typeof Platform.OS, string>> = {
  ios: 'Set up Face ID or Touch ID in Settings, or unlock it with your passcode, then try again.',
  android: 'Add a fingerprint in Settings, then try again.',
};

export const deviceSigner = {
  publicKey(): Promise<string | null> {
    return SecureStore.getItemAsync(publicKeyKey);
  },

  async create(): Promise<string> {
    if (!SecureStore.canUseBiometricAuthentication()) {
      throw new Error(biometricsHelp[Platform.OS] ?? biometricsHelp.ios);
    }
    const secret = randomBytes(32);
    const publicKey = base64.encode(ed25519.getPublicKey(secret));
    await SecureStore.deleteItemAsync(secretKey);
    await SecureStore.setItemAsync(secretKey, base64.encode(secret), biometricOptions);
    await SecureStore.setItemAsync(publicKeyKey, publicKey);
    return publicKey;
  },

  async sign(digest: Uint8Array): Promise<string> {
    const secret = await SecureStore.getItemAsync(secretKey, biometricOptions);
    if (!secret) {
      throw new Error('No device key on this phone');
    }
    return base64.encode(ed25519.sign(digest, base64.decode(secret)));
  },
};
