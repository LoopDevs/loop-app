import { p256 } from '@noble/curves/nist';
import { sha256 } from '@noble/hashes/sha2';
import { concatBytes, randomBytes } from '@noble/hashes/utils';

import { base64 } from './base64.ts';
import { PasskeyAssertion, type PasskeyAssertionJson } from './passkey-assertion.ts';

export type SignedCredential = { id: string; response: PasskeyAssertionJson };

export type PasskeyHolder = {
  credentialId: Uint8Array;
  publicKey: Uint8Array;
  respond(challenge: Uint8Array): Promise<SignedCredential>;
  sign(challenge: Uint8Array): Promise<PasskeyAssertion>;
};

export function passkeyHolder(credentialId: Uint8Array = randomBytes(16)): PasskeyHolder {
  const secret = p256.utils.randomPrivateKey();
  const publicKey = p256.getPublicKey(secret, false);
  const respond = async (challenge: Uint8Array): Promise<SignedCredential> => {
    const authenticatorData = randomBytes(37);
    const clientDataJson = new TextEncoder().encode(
      JSON.stringify({ type: 'webauthn.get', challenge: PasskeyAssertion.challengeOf(challenge) }),
    );
    const signature = p256.sign(concatBytes(authenticatorData, sha256(clientDataJson)), secret, { lowS: true });
    return {
      id: base64.encodeUrl(credentialId),
      response: {
        authenticatorData: base64.encodeUrl(authenticatorData),
        clientDataJSON: base64.encodeUrl(clientDataJson),
        signature: base64.encodeUrl(signature.toBytes('der')),
      },
    };
  };
  const sign = async (challenge: Uint8Array) => PasskeyAssertion.fromCredential(await respond(challenge));
  return { credentialId, publicKey, respond, sign };
}
