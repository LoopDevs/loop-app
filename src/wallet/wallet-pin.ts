import { bytesToHex, randomBytes } from '@noble/hashes/utils';

import type { TokenStorage } from '../session/install-scoped-token.ts';
import { base64 } from './base64.ts';
import type { Passkey } from './passkey.ts';
import type { PasskeyAssertion } from './passkey-assertion.ts';
import type { WalletCheck } from './wallet-rules.ts';

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

type SignWithPasskey = (challenge: Uint8Array) => Promise<PasskeyAssertion>;

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
    return usable.find((candidate) => candidate.address === pinned?.address) ?? usable[0] ?? null;
  }

  static current(pinned: PinnedWallet | null, address: string, passkeyPublicKey: Uint8Array): PinnedWallet | null {
    if (!pinned || pinned.address !== address || pinned.passkeyPublicKey !== base64.encode(passkeyPublicKey)) {
      return null;
    }
    return pinned;
  }

  async read(): Promise<PinnedWallet | null> {
    const record = await this.record(this.key);
    if (!record) {
      return null;
    }
    const { address, passkeyPublicKey } = record;
    if (typeof address !== 'string' || typeof passkeyPublicKey !== 'string') {
      await this.storage.removeItem(this.key);
      return null;
    }
    return { address, passkeyPublicKey };
  }

  async write(pinned: PinnedWallet): Promise<void> {
    await this.requireCurrentUser();
    await this.storage.setItem(this.key, JSON.stringify(pinned));
    await this.storage.removeItem(this.pendingKey);
  }

  async pendingPasskey(): Promise<Passkey | null> {
    const record = await this.record(this.pendingKey);
    if (!record) {
      return null;
    }
    const { credentialId, publicKey } = record;
    if (typeof credentialId !== 'string' || typeof publicKey !== 'string') {
      await this.storage.removeItem(this.pendingKey);
      return null;
    }
    return { credentialId, publicKey: base64.decode(publicKey) };
  }

  async passkeyForSetup(create: () => Promise<Passkey>, signWithPasskey: SignWithPasskey): Promise<Passkey> {
    const pending = await this.pendingPasskey();
    if (pending && (await WalletPin.stillHeld(pending, signWithPasskey))) {
      return pending;
    }
    if (pending) {
      await this.storage.removeItem(this.pendingKey);
    }
    const created = await create();
    await this.requireCurrentUser();
    await this.storage.setItem(
      this.pendingKey,
      JSON.stringify({ credentialId: created.credentialId, publicKey: base64.encode(created.publicKey) }),
    );
    return created;
  }

  async admits(pinned: PinnedWallet | null, address: string, checked: WalletCheck): Promise<boolean> {
    if (checked.thisDevice === 'unlinked') {
      return false;
    }
    return pinned !== null || (await this.pinCreatedHere(address, checked.passkeyPublicKey));
  }

  async confirmThisDevice(
    pinned: PinnedWallet | null,
    address: string,
    checked: WalletCheck,
    addDevice: () => Promise<void>,
    signWithPasskey: SignWithPasskey,
  ): Promise<void> {
    if (checked.thisDevice === 'unlinked') {
      await addDevice();
      await this.write({ address, passkeyPublicKey: base64.encode(checked.passkeyPublicKey) });
      return;
    }
    if (!pinned) {
      await this.pinConfirmed(address, checked.passkeyPublicKey, signWithPasskey);
    }
  }

  async pinCreatedHere(address: string, passkeyPublicKey: Uint8Array): Promise<boolean> {
    const pending = await this.pendingPasskey();
    if (!pending || bytesToHex(pending.publicKey) !== bytesToHex(passkeyPublicKey)) {
      return false;
    }
    await this.write({ address, passkeyPublicKey: base64.encode(passkeyPublicKey) });
    return true;
  }

  async pinConfirmed(address: string, passkeyPublicKey: Uint8Array, signWithPasskey: SignWithPasskey): Promise<void> {
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

  private async record(key: string): Promise<Record<string, unknown> | null> {
    const stored = await this.storage.getItem(key);
    return stored === null ? null : WalletPin.parse(stored);
  }

  private static async stillHeld(passkey: Passkey, signWithPasskey: SignWithPasskey): Promise<boolean> {
    const challenge = randomBytes(32);
    try {
      (await signWithPasskey(challenge)).requireSigned(challenge, passkey.publicKey);
      return true;
    } catch {
      return false;
    }
  }

  private static parse(stored: string): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(stored);
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
}
