import { bytesToHex, randomBytes } from '@noble/hashes/utils';

import type { TokenStorage } from '../session/install-scoped-token.ts';
import { base64 } from './base64.ts';
import type { Passkey } from './passkey.ts';
import type { PasskeyAssertion } from './passkey-assertion.ts';

export type PinnedWallet = {
  address: string;
  passkeyPublicKey: string;
};

type LinkShape = {
  address: string;
  chain: string;
  sponsored: boolean;
  status: string;
};

export class WalletPin {
  readonly key: string;
  readonly pendingKey: string;
  private readonly storage: TokenStorage;
  private readonly userId: string;
  private readonly currentUserId: () => Promise<string>;

  constructor(storage: TokenStorage, userId: string, currentUserId: () => Promise<string>) {
    const scope = base64.encodeUrl(new TextEncoder().encode(userId));
    this.key = `wallet.pin.${scope}`;
    this.pendingKey = `wallet.pending.${scope}`;
    this.storage = storage;
    this.userId = userId;
    this.currentUserId = currentUserId;
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
    if (stored === null) {
      return null;
    }
    const { address, passkeyPublicKey } = WalletPin.parse(stored);
    if (typeof address !== 'string' || typeof passkeyPublicKey !== 'string') {
      throw WalletPin.unreadable();
    }
    return { address, passkeyPublicKey };
  }

  async write(pinned: PinnedWallet): Promise<void> {
    await this.requireCurrentUser();
    await this.storage.setItem(this.key, JSON.stringify(pinned));
    await this.storage.removeItem(this.pendingKey);
  }

  async pendingPasskey(): Promise<Passkey | null> {
    const stored = await this.storage.getItem(this.pendingKey);
    if (stored === null) {
      return null;
    }
    const { credentialId, publicKey } = WalletPin.parse(stored);
    if (typeof credentialId !== 'string' || typeof publicKey !== 'string') {
      throw WalletPin.unreadable();
    }
    return { credentialId, publicKey: base64.decode(publicKey) };
  }

  async passkeyForSetup(create: () => Promise<Passkey>): Promise<Passkey> {
    const pending = await this.pendingPasskey();
    if (pending) {
      return pending;
    }
    const created = await create();
    await this.requireCurrentUser();
    await this.storage.setItem(
      this.pendingKey,
      JSON.stringify({ credentialId: created.credentialId, publicKey: base64.encode(created.publicKey) }),
    );
    return created;
  }

  async pinCreatedHere(address: string, passkeyPublicKey: Uint8Array): Promise<boolean> {
    const pending = await this.pendingPasskey();
    if (!pending || bytesToHex(pending.publicKey) !== bytesToHex(passkeyPublicKey)) {
      return false;
    }
    await this.write({ address, passkeyPublicKey: base64.encode(passkeyPublicKey) });
    return true;
  }

  async pinConfirmed(
    address: string,
    passkeyPublicKey: Uint8Array,
    signWithPasskey: (challenge: Uint8Array) => Promise<PasskeyAssertion>,
  ): Promise<void> {
    const challenge = randomBytes(32);
    const assertion = await signWithPasskey(challenge);
    assertion.requireSigned(challenge, passkeyPublicKey);
    await this.write({ address, passkeyPublicKey: base64.encode(passkeyPublicKey) });
  }

  async requireCurrentUser(): Promise<void> {
    if ((await this.currentUserId()) !== this.userId) {
      throw new Error('You switched accounts while Loop was setting up. Try again.');
    }
  }

  private static parse(stored: string): Record<string, unknown> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stored);
    } catch {
      throw WalletPin.unreadable();
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw WalletPin.unreadable();
    }
    return parsed as Record<string, unknown>;
  }

  private static unreadable(): Error {
    return new Error("The wallet saved on this device can't be read. Contact support.");
  }
}
