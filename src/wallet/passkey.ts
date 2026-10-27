import { randomBytes } from '@noble/hashes/utils';
import { Platform } from 'react-native';
import * as Passkeys from 'react-native-passkeys';

import { loopEnvironment } from '@/environment';
import { base64 } from '@/wallet/base64';
import { PasskeyAssertion } from '@/wallet/passkey-assertion';
import { PasskeyPublicKey } from '@/wallet/passkey-public-key';

const nativeRpId = 'loopfinance.io';

export type Passkey = {
  credentialId: string;
  publicKey: Uint8Array;
};

export const passkey = {
  async create(label: string): Promise<Passkey> {
    const passkeyLabel = loopEnvironment.passkeyLabel(label);
    const created = await Passkeys.create({
      challenge: base64.encodeUrl(randomBytes(32)),
      rp: { id: rpId(), name: 'Loop' },
      user: { id: base64.encodeUrl(randomBytes(16)), name: passkeyLabel, displayName: passkeyLabel },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    }).catch((error: unknown) => {
      throw passkeySetupError(error);
    });
    const spki = created?.response.getPublicKey();
    if (!created || !spki) {
      throw new Error('Passkey creation was cancelled or returned no public key');
    }
    const publicKey = PasskeyPublicKey.uncompressedPoint(base64.decode(spki));
    return { credentialId: created.id, publicKey };
  },

  async sign(challenge: Uint8Array): Promise<PasskeyAssertion> {
    const signed = await Passkeys.get({
      challenge: PasskeyAssertion.challengeOf(challenge),
      rpId: rpId(),
      userVerification: 'required',
    });
    if (!signed) {
      throw new Error('The confirmation was cancelled');
    }
    return PasskeyAssertion.fromResponse(signed.response);
  },

  isUserCancel,
};

const providerHelp: Partial<Record<typeof Platform.OS, string>> = {
  ios: "Couldn't create a passkey. Make sure iCloud Keychain is on in Settings, then try again.",
  android:
    "Couldn't create a passkey. Make sure this phone is signed in to a Google account with Password Manager on, then try again.",
};

function passkeySetupError(error: unknown): unknown {
  const help = providerHelp[Platform.OS];
  if (!help || isUserCancel(error)) {
    return error;
  }
  return new Error(help, { cause: error });
}

function isUserCancel(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = 'code' in error ? String(error.code) : '';
  return code === 'ERR_USER_CANCELLED' || error.message === 'UserCancelled';
}

function rpId(): string {
  return Platform.OS === 'web' ? window.location.hostname : nativeRpId;
}
