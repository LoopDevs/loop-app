import { base64 } from '@/wallet/base64';
import { DeviceKey } from '@/wallet/device-key';

const databaseName = 'loop-device-signer';
const storeName = 'keys';

export const deviceSigner = {
  async publicKey(userId: string): Promise<string | null> {
    const keyPair = await read(userId);
    if (!keyPair) {
      return null;
    }
    keepStorage();
    return exportPublicKey(keyPair);
  },

  async create(userId: string): Promise<string> {
    keepStorage();
    const existing = await readOwn(userId);
    if (existing) {
      return exportPublicKey(existing);
    }
    const keyPair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    await write(userId, keyPair);
    return exportPublicKey(keyPair);
  },

  async sign(userId: string, digest: Uint8Array): Promise<string> {
    const keyPair = await read(userId);
    if (!keyPair) {
      throw new Error('No device key in this browser');
    }
    const signature = await crypto.subtle.sign(
      { name: 'Ed25519' },
      keyPair.privateKey,
      digest as BufferSource,
    );
    return base64.encode(new Uint8Array(signature));
  },
};

async function exportPublicKey(keyPair: CryptoKeyPair): Promise<string> {
  return base64.encode(new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey)));
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await open();
  return new Promise((resolve, reject) => {
    const request = action(database.transaction(storeName, mode).objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const sharedKeyName = 'device';

function readOwn(userId: string): Promise<CryptoKeyPair | undefined> {
  const keyName = DeviceKey.storageName(userId);
  return transact('readonly', (store) => store.get(keyName));
}

async function read(userId: string): Promise<CryptoKeyPair | undefined> {
  const own = await readOwn(userId);
  return own ?? transact('readonly', (store) => store.get(sharedKeyName));
}

let storageKept: Promise<boolean> | null = null;

function keepStorage(): void {
  storageKept ??= Promise.resolve(navigator.storage?.persist?.() ?? false).catch((error: unknown) => {
    console.warn('Asking the browser to keep storage failed', error);
    return false;
  });
}

async function write(userId: string, keyPair: CryptoKeyPair): Promise<void> {
  const keyName = DeviceKey.storageName(userId);
  await transact('readwrite', (store) => store.put(keyPair, keyName));
}
