import { base64 } from '@/wallet/base64';

const databaseName = 'loop-device-signer';
const storeName = 'keys';
const keyName = 'device';

export const deviceSigner = {
  async publicKey(): Promise<string | null> {
    const keyPair = await read();
    return keyPair ? exportPublicKey(keyPair) : null;
  },

  async create(): Promise<string> {
    const keyPair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    await write(keyPair);
    return exportPublicKey(keyPair);
  },

  async sign(digest: Uint8Array): Promise<string> {
    const keyPair = await read();
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

function read(): Promise<CryptoKeyPair | undefined> {
  return transact('readonly', (store) => store.get(keyName));
}

async function write(keyPair: CryptoKeyPair): Promise<void> {
  await transact('readwrite', (store) => store.put(keyPair, keyName));
}
