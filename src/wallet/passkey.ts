import { randomBytes } from '@noble/hashes/utils';
import { Platform } from 'react-native';
import * as Passkeys from 'react-native-passkeys';

import { base64 } from '@/wallet/base64';

const nativeRpId = 'loopfinance.io';
const uncompressedPointLength = 65;
const uncompressedPointPrefix = 0x04;

export type Passkey = {
  credentialId: string;
  publicKey: Uint8Array;
};

export const passkey = {
  async create(label: string): Promise<Passkey> {
    const created = await Passkeys.create({
      challenge: base64.encode(randomBytes(32)),
      rp: { id: rpId(), name: 'Loop' },
      user: { id: base64.encode(randomBytes(16)), name: label, displayName: label },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    const spki = created?.response.getPublicKey();
    if (!created || !spki) {
      throw new Error('Passkey creation was cancelled or returned no public key');
    }
    const publicKey = base64.decode(spki).slice(-uncompressedPointLength);
    if (publicKey.length !== uncompressedPointLength || publicKey[0] !== uncompressedPointPrefix) {
      throw new Error('The passkey is not a P-256 key');
    }
    return { credentialId: created.id, publicKey };
  },
};

function rpId(): string {
  return Platform.OS === 'web' ? window.location.hostname : nativeRpId;
}
