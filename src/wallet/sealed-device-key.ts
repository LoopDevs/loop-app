export type SealedDeviceKeyRecord = {
  credentialId: string;
  salt: Uint8Array<ArrayBuffer>;
  publicKey: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
  sealed: Uint8Array<ArrayBuffer>;
};

export class SecretMismatch extends Error {
  constructor() {
    super('This confirmation does not unlock the device key');
  }
}

export class SealedDeviceKey {
  static readonly saltBytes = 32;
  private static readonly info = new TextEncoder().encode('loop sealed device key');

  readonly record: SealedDeviceKeyRecord;

  private constructor(record: SealedDeviceKeyRecord) {
    this.record = record;
  }

  static from(value: unknown): SealedDeviceKey | null {
    if (typeof value !== 'object' || value === null) {
      return null;
    }
    const record = value as Partial<SealedDeviceKeyRecord>;
    const complete =
      typeof record.credentialId === 'string' &&
      record.salt instanceof Uint8Array &&
      record.publicKey instanceof Uint8Array &&
      record.iv instanceof Uint8Array &&
      record.sealed instanceof Uint8Array;
    return complete ? new SealedDeviceKey(record as SealedDeviceKeyRecord) : null;
  }

  static newSalt(): Uint8Array<ArrayBuffer> {
    return crypto.getRandomValues(new Uint8Array(SealedDeviceKey.saltBytes));
  }

  static async seal(
    credentialId: string,
    salt: Uint8Array<ArrayBuffer>,
    secret: Uint8Array<ArrayBuffer>,
  ): Promise<SealedDeviceKey> {
    const keyPair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    try {
      const sealed = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: publicKey },
        await SealedDeviceKey.sealingKey(secret, salt),
        pkcs8,
      );
      return new SealedDeviceKey({ credentialId, salt, publicKey, iv, sealed: new Uint8Array(sealed) });
    } finally {
      pkcs8.fill(0);
    }
  }

  async sign(secret: Uint8Array<ArrayBuffer>, digest: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
    const { salt, iv, publicKey, sealed } = this.record;
    const opened = await crypto.subtle
      .decrypt({ name: 'AES-GCM', iv, additionalData: publicKey }, await SealedDeviceKey.sealingKey(secret, salt), sealed)
      .catch(() => {
        throw new SecretMismatch();
      });
    const pkcs8 = new Uint8Array(opened);
    try {
      const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign']);
      return new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, digest));
    } finally {
      pkcs8.fill(0);
    }
  }

  private static async sealingKey(secret: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
    const material = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt, info: SealedDeviceKey.info },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }
}
