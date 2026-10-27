import { errorReporting } from '@/ops/error-reporting';
import { base64 } from '@/wallet/base64';
import { DeviceKey } from '@/wallet/device-key';
import { reportingSigningFailure } from '@/wallet/signing-report';

const databaseName = 'loop-device-signer';
const storeName = 'keys';
const unsupportedBrowserMessage =
  "This browser can't set up your wallet. Update it, or use the latest Chrome, Safari or Firefox.";

export const deviceSigner = {
  async publicKey(userId: string): Promise<string | null> {
    const keyPair = await read(userId);
    return keyPair ? exportPublicKey(keyPair) : null;
  },

  create(userId: string): Promise<string> {
    return reportingSigningFailure('device key', errorReporting.reportError, () => createKey(userId));
  },

  sign(userId: string, digest: Uint8Array): Promise<string> {
    return reportingSigningFailure('device key', errorReporting.reportError, () => signDigest(userId, digest));
  },
};

async function createKey(userId: string): Promise<string> {
  keepStorage();
  const existing = await read(userId);
  if (existing) {
    return exportPublicKey(existing);
  }
  const keyPair = (await crypto.subtle
    .generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
    .catch((error: unknown) => {
      console.warn('Creating a device key failed', error);
      throw new Error(unsupportedBrowserMessage);
    })) as CryptoKeyPair;
  const stored = await writeIfAbsent(userId, keyPair);
  return exportPublicKey(stored);
}

async function signDigest(userId: string, digest: Uint8Array): Promise<string> {
  const keyPair = await read(userId);
  if (!keyPair) {
    throw new Error('No device key in this browser');
  }
  const signature = await crypto.subtle.sign({ name: 'Ed25519' }, keyPair.privateKey, digest as BufferSource);
  return base64.encode(new Uint8Array(signature));
}

async function exportPublicKey(keyPair: CryptoKeyPair): Promise<string> {
  return base64.encode(new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey)));
}

let database: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
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

function read(userId: string): Promise<CryptoKeyPair | undefined> {
  const keyName = DeviceKey.storageName(userId);
  return transact('readonly', (store) => store.get(keyName));
}

let storageKept: Promise<boolean> | null = null;

function keepStorage(): void {
  storageKept ??= Promise.resolve(navigator.storage?.persist?.() ?? false).catch((error: unknown) => {
    console.warn('Asking the browser to keep storage failed', error);
    return false;
  });
}

async function writeIfAbsent(userId: string, keyPair: CryptoKeyPair): Promise<CryptoKeyPair> {
  const keyName = DeviceKey.storageName(userId);
  try {
    await transact('readwrite', (store) => store.add(keyPair, keyName));
    return keyPair;
  } catch (error) {
    const existing = error instanceof DOMException && error.name === 'ConstraintError' ? await read(userId) : null;
    if (!existing) {
      throw error;
    }
    return existing;
  }
}
