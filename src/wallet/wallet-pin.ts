import { base64 } from './base64.ts';

export type PinnedWallet = {
  address: string;
  passkeyPublicKey: string;
};

export type WalletPinStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

type LinkShape = {
  address: string;
  chain: string;
  sponsored: boolean;
  status: string;
};

export class WalletPin {
  readonly key: string;
  private readonly storage: WalletPinStorage;

  constructor(storage: WalletPinStorage, userId: string) {
    this.key = `wallet.pin.${base64.encodeUrl(new TextEncoder().encode(userId))}`;
    this.storage = storage;
  }

  static choose<T extends LinkShape>(links: readonly T[], pinned: PinnedWallet | null): T | null {
    const usable = links.filter(
      (candidate) => candidate.sponsored && candidate.chain === 'XLM' && candidate.status === 'active',
    );
    if (!pinned) {
      return usable[0] ?? null;
    }
    const match = usable.find((candidate) => candidate.address === pinned.address);
    if (!match) {
      throw new Error("Your account doesn't list the wallet created on this device. Contact support.");
    }
    return match;
  }

  async read(): Promise<PinnedWallet | null> {
    const stored = await this.storage.getItem(this.key);
    if (!stored) {
      return null;
    }
    try {
      const { address, passkeyPublicKey } = JSON.parse(stored) as Record<string, unknown>;
      return typeof address === 'string' && typeof passkeyPublicKey === 'string'
        ? { address, passkeyPublicKey }
        : null;
    } catch {
      return null;
    }
  }

  write(pinned: PinnedWallet): Promise<void> {
    return this.storage.setItem(this.key, JSON.stringify(pinned));
  }
}
