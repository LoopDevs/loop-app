import { ed25519 } from '@noble/curves/ed25519';
import { randomBytes } from '@noble/hashes/utils';

import { base64 } from './base64.ts';

export type DeviceKeyStorage = {
  read(name: string, biometric: boolean): Promise<string | null>;
  write(name: string, value: string, biometric: boolean): Promise<void>;
  remove(name: string): Promise<void>;
};

export class MissingDeviceSecret extends Error {
  constructor() {
    super('No device key on this phone');
  }
}

export class IdentityNotConfirmed extends Error {
  private static readonly declinedMessages = [/User canceled the operation/, /User canceled the authentication/];

  constructor() {
    super('Couldn’t confirm it’s you. Try again.');
  }

  static from(error: unknown): unknown {
    const message = error instanceof Error ? error.message : String(error);
    return IdentityNotConfirmed.declinedMessages.some((pattern) => pattern.test(message))
      ? new IdentityNotConfirmed()
      : error;
  }
}

export class DeviceKey {
  private static readonly creating = new Map<string, Promise<string>>();
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

  publicKey(): Promise<string | null> {
    return this.storage.read(this.publicKeyName, false);
  }

  create(): Promise<string> {
    const pending = DeviceKey.creating.get(this.publicKeyName);
    if (pending) {
      return pending;
    }
    const creating = this.existingOrNewKey().finally(() => {
      DeviceKey.creating.delete(this.publicKeyName);
    });
    DeviceKey.creating.set(this.publicKeyName, creating);
    return creating;
  }

  private async existingOrNewKey(): Promise<string> {
    const existing = await this.storage.read(this.publicKeyName, false);
    if (existing) {
      return existing;
    }
    const secret = randomBytes(32);
    const publicKey = base64.encode(ed25519.getPublicKey(secret));
    await this.storage.remove(this.secretName);
    await this.storage.write(this.secretName, base64.encode(secret), true);
    await this.storage.write(this.publicKeyName, publicKey, false);
    return publicKey;
  }

  async sign(digest: Uint8Array): Promise<string> {
    const secret = await this.storage.read(this.secretName, true);
    if (!secret) {
      await this.storage.remove(this.publicKeyName);
      throw new MissingDeviceSecret();
    }
    return base64.encode(ed25519.sign(digest, base64.decode(secret)));
  }
}
