import { ed25519 } from '@noble/curves/ed25519';
import { randomBytes } from '@noble/hashes/utils';

import { base64 } from './base64.ts';

export type DeviceKeyStorage = {
  read(name: string, biometric: boolean): Promise<string | null>;
  write(name: string, value: string, biometric: boolean): Promise<void>;
  remove(name: string): Promise<void>;
};

export class DeviceKey {
  readonly secretName: string;
  readonly publicKeyName: string;
  private readonly storage: DeviceKeyStorage;

  constructor(storage: DeviceKeyStorage, userId: string) {
    const name = DeviceKey.storageName(userId);
    this.secretName = `${name}.secret`;
    this.publicKeyName = `${name}.public`;
    this.storage = storage;
  }

  static storageName(userId: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(userId)) {
      throw new Error('Unexpected user id for the device key');
    }
    return `device.signer.${userId}`;
  }

  static readonly sharedSecretName = 'device.signer.secret';
  static readonly sharedPublicKeyName = 'device.signer.public';

  async publicKey(): Promise<string | null> {
    const own = await this.storage.read(this.publicKeyName, false);
    return own ?? this.storage.read(DeviceKey.sharedPublicKeyName, false);
  }

  async create(): Promise<string> {
    const secret = randomBytes(32);
    const publicKey = base64.encode(ed25519.getPublicKey(secret));
    await this.storage.remove(this.secretName);
    await this.storage.write(this.secretName, base64.encode(secret), true);
    await this.storage.write(this.publicKeyName, publicKey, false);
    return publicKey;
  }

  async sign(digest: Uint8Array): Promise<string> {
    const ownPublicKey = await this.storage.read(this.publicKeyName, false);
    const secretName = ownPublicKey ? this.secretName : DeviceKey.sharedSecretName;
    const secret = await this.storage.read(secretName, true);
    if (!secret) {
      throw new Error('No device key on this phone');
    }
    return base64.encode(ed25519.sign(digest, base64.decode(secret)));
  }
}
