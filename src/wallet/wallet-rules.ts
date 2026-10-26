import { bytesToHex } from '@noble/hashes/utils';

import { network } from '../stellar/network.ts';

export type ContextRule = {
  id: number;
  signers: [string, string, Uint8Array][];
  valid_until: number | null | undefined;
};

export type WalletReading = {
  wasmHash: string;
  ruleCount: unknown;
  passkeyRule: ContextRule;
  deviceRule: ContextRule;
};

export type WalletCheck = {
  passkeyPublicKey: Uint8Array;
  thisDevice: 'linked' | 'unlinked';
};

export class WalletRules {
  static check(
    reading: WalletReading,
    passkeyPublicKey: Uint8Array | undefined,
    devicePublicKey: Uint8Array | null,
  ): WalletCheck {
    if (reading.wasmHash !== network.accountWasmHash) {
      throw new Error('The wallet runs unexpected code');
    }
    if (reading.ruleCount !== 2) {
      throw new Error('The wallet has unexpected rules');
    }
    const passkeyKey = WalletRules.requireSigner(reading.passkeyRule, network.webauthnVerifier, passkeyPublicKey);
    const deviceKey = WalletRules.requireSigner(reading.deviceRule, network.ed25519Verifier);
    const linked = devicePublicKey !== null && bytesToHex(deviceKey) === bytesToHex(devicePublicKey);
    return { passkeyPublicKey: passkeyKey, thisDevice: linked ? 'linked' : 'unlinked' };
  }

  static holdsDeviceKey(rule: ContextRule, devicePublicKey: Uint8Array): boolean {
    const deviceKey = WalletRules.requireSigner(rule, network.ed25519Verifier);
    return bytesToHex(deviceKey) === bytesToHex(devicePublicKey);
  }

  private static requireSigner(rule: ContextRule, verifier: string, publicKey?: Uint8Array): Uint8Array {
    if (rule.signers.length !== 1 || rule.valid_until != null) {
      throw new Error(`Wallet rule ${rule.id} is not a single permanent signer`);
    }
    const [kind, signerVerifier, keyData] = rule.signers[0];
    if (kind !== 'External' || signerVerifier !== verifier) {
      throw new Error(`Wallet rule ${rule.id} uses an unexpected verifier`);
    }
    if (publicKey && bytesToHex(keyData) !== bytesToHex(publicKey)) {
      throw new Error(`Wallet rule ${rule.id} holds a different key`);
    }
    return keyData;
  }
}
