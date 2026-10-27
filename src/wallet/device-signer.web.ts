import { loopEnvironment } from '@/environment';
import { base64 } from '@/wallet/base64';
import { DeviceKey, IdentityNotConfirmed } from '@/wallet/device-key';
import { PasskeySite } from '@/wallet/passkey-site';
import { SealedDeviceKey } from '@/wallet/sealed-device-key';

const databaseName = 'loop-device-signer';
const databaseVersion = 2;
const storeName = 'keys';
const credentialLabel = 'Loop on this browser';
const unsupportedBrowserMessage =
  "This browser can't set up your wallet. Update it, or use the latest Chrome, Safari or Firefox.";

export const deviceSigner = {
  async publicKey(userId: string): Promise<string | null> {
    const key = await read(userId);
    return key ? base64.encode(key.record.publicKey) : null;
  },

  async create(userId: string): Promise<string> {
    keepStorage();
    const existing = await read(userId);
    if (existing) {
      return base64.encode(existing.record.publicKey);
    }
    const salt = SealedDeviceKey.newSalt();
    const created = await deviceCredential.create(salt);
    const secret = created.secret ?? (await deviceCredential.secret(created.credentialId, salt));
    const sealed = await SealedDeviceKey.seal(created.credentialId, salt, secret);
    const stored = await writeIfAbsent(userId, sealed);
    return base64.encode(stored.record.publicKey);
  },

  async sign(userId: string, digest: Uint8Array): Promise<string> {
    const key = await read(userId);
    if (!key) {
      throw new Error('No device key in this browser');
    }
    const secret = await deviceCredential.secret(key.record.credentialId, key.record.salt);
    return base64.encode(await key.sign(secret, digest.slice()));
  },
};

type CreatedCredential = {
  credentialId: string;
  secret: Uint8Array<ArrayBuffer> | null;
};

const deviceCredential = {
  async create(salt: Uint8Array<ArrayBuffer>): Promise<CreatedCredential> {
    const capabilities = await PublicKeyCredential.getClientCapabilities?.().catch(() => undefined);
    if (capabilities?.['extension:prf'] === false) {
      throw new Error(unsupportedBrowserMessage);
    }
    const label = loopEnvironment.passkeyLabel(credentialLabel);
    const credential = await confirmed(() =>
      navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { id: site(), name: 'Loop' },
          user: { id: crypto.getRandomValues(new Uint8Array(16)), name: label, displayName: label },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: { residentKey: 'discouraged', userVerification: 'required' },
          extensions: { prf: { eval: { first: salt } } },
        },
      }),
    );
    const prf = credential.getClientExtensionResults().prf;
    const secret = prfSecret(prf);
    if (!prf?.enabled && !secret) {
      throw new Error(unsupportedBrowserMessage);
    }
    return { credentialId: base64.encodeUrl(new Uint8Array(credential.rawId)), secret };
  },

  async secret(credentialId: string, salt: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
    const credential = await confirmed(() =>
      navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rpId: site(),
          allowCredentials: [{ type: 'public-key', id: base64.decode(credentialId).slice() }],
          userVerification: 'required',
          extensions: { prf: { eval: { first: salt } } },
        },
      }),
    );
    const secret = prfSecret(credential.getClientExtensionResults().prf);
    if (!secret) {
      throw new Error(unsupportedBrowserMessage);
    }
    return secret;
  },
};

function site(): string {
  return PasskeySite.forHost(window.location.hostname);
}

async function confirmed(request: () => Promise<Credential | null>): Promise<PublicKeyCredential> {
  const credential = await request().catch((error: unknown) => {
    throw error instanceof DOMException && error.name === 'NotAllowedError' ? new IdentityNotConfirmed() : error;
  });
  if (!(credential instanceof PublicKeyCredential)) {
    throw new IdentityNotConfirmed();
  }
  return credential;
}

function prfSecret(prf: AuthenticationExtensionsPRFOutputs | undefined): Uint8Array<ArrayBuffer> | null {
  const first = prf?.results?.first;
  if (!first) {
    return null;
  }
  return ArrayBuffer.isView(first)
    ? new Uint8Array(first.buffer, first.byteOffset, first.byteLength).slice()
    : new Uint8Array(first).slice();
}

let database: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const upgrading = request.result;
      if (upgrading.objectStoreNames.contains(storeName)) {
        upgrading.deleteObjectStore(storeName);
      }
      upgrading.createObjectStore(storeName);
    };
    request.onsuccess = () => {
      const opened = request.result;
      opened.onversionchange = () => {
        opened.close();
        database = null;
      };
      opened.onclose = () => {
        database = null;
      };
      resolve(opened);
    };
    request.onerror = () => reject(request.error);
  }).catch((error: unknown) => {
    database = null;
    throw error;
  });
  return database;
}

async function begin(mode: IDBTransactionMode): Promise<IDBTransaction> {
  try {
    return (await open()).transaction(storeName, mode);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'InvalidStateError')) {
      throw error;
    }
    database = null;
    return (await open()).transaction(storeName, mode);
  }
}

async function transact<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const transaction = await begin(mode);
  const request = action(transaction.objectStore(storeName));
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error ?? request.error);
    transaction.onabort = () => reject(transaction.error ?? request.error);
  });
}

async function read(userId: string): Promise<SealedDeviceKey | null> {
  const keyName = DeviceKey.storageName(userId);
  return SealedDeviceKey.from(await transact('readonly', (store) => store.get(keyName)));
}

let storageKept: Promise<boolean> | null = null;

function keepStorage(): void {
  storageKept ??= Promise.resolve(navigator.storage?.persist?.() ?? false).catch((error: unknown) => {
    console.warn('Asking the browser to keep storage failed', error);
    return false;
  });
}

async function writeIfAbsent(userId: string, key: SealedDeviceKey): Promise<SealedDeviceKey> {
  const keyName = DeviceKey.storageName(userId);
  try {
    await transact('readwrite', (store) => store.add(key.record, keyName));
    return key;
  } catch (error) {
    const existing = error instanceof DOMException && error.name === 'ConstraintError' ? await read(userId) : null;
    if (!existing) {
      throw error;
    }
    return existing;
  }
}
