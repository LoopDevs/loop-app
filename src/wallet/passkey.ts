import { randomBytes } from '@noble/hashes/utils';
import { Platform } from 'react-native';
import * as Passkeys from 'react-native-passkeys';

import { loopEnvironment } from '@/environment';
import { errorReporting } from '@/ops/error-reporting';
import { base64 } from '@/wallet/base64';
import { PasskeyAssertion } from '@/wallet/passkey-assertion';
import { PasskeyPublicKey } from '@/wallet/passkey-public-key';
import { PasskeySite } from '@/wallet/passkey-site';
import { reportingSigningFailure } from '@/wallet/signing-report';
import { isUserCancel, UserCancelled } from '@/wallet/user-cancel';

function rpId(): string {
  return PasskeySite.forHost(Platform.OS === 'web' ? window.location.hostname : null);
}

export type Passkey = {
  credentialId: string;
  publicKey: Uint8Array;
};

export const passkey = {
  create(label: string): Promise<Passkey> {
    return reportingSigningFailure('passkey', errorReporting.reportError, () => createPasskey(label));
  },

  sign(challenge: Uint8Array): Promise<PasskeyAssertion> {
    return reportingSigningFailure('passkey', errorReporting.reportError, () => signChallenge(challenge));
  },

  isUserCancel,
};

async function createPasskey(label: string): Promise<Passkey> {
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
  if (!created) {
    throw new UserCancelled('Passkey creation was cancelled');
  }
  const spki = created.response.getPublicKey();
  if (!spki) {
    throw new Error('Passkey creation returned no public key');
  }
  const publicKey = PasskeyPublicKey.uncompressedPoint(base64.decode(spki));
  return { credentialId: created.id, publicKey };
}

async function signChallenge(challenge: Uint8Array): Promise<PasskeyAssertion> {
  const signed = await Passkeys.get({
    challenge: PasskeyAssertion.challengeOf(challenge),
    rpId: rpId(),
    userVerification: 'required',
  });
  if (!signed) {
    throw new UserCancelled('The confirmation was cancelled');
  }
  return PasskeyAssertion.fromCredential(signed);
}

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
