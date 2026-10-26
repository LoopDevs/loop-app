import { p256 } from '@noble/curves/nist';
import { sha256 } from '@noble/hashes/sha2';
import { concatBytes } from '@noble/hashes/utils';

import type { PasskeySignature } from '../ctx/client.ts';
import { base64 } from './base64.ts';

export type PasskeyAssertionJson = {
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
};

export class PasskeyAssertion {
  readonly authenticatorData: Uint8Array;
  readonly clientDataJson: Uint8Array;
  readonly signature: Uint8Array;

  private constructor(authenticatorData: Uint8Array, clientDataJson: Uint8Array, signature: Uint8Array) {
    this.authenticatorData = authenticatorData;
    this.clientDataJson = clientDataJson;
    this.signature = signature;
  }

  static fromResponse(response: PasskeyAssertionJson): PasskeyAssertion {
    return new PasskeyAssertion(
      base64.decode(response.authenticatorData),
      base64.decode(response.clientDataJSON),
      PasskeyAssertion.rawLowS(base64.decode(response.signature)),
    );
  }

  static challengeOf(digest: Uint8Array): string {
    return base64.encodeUrl(digest);
  }

  static rawLowS(der: Uint8Array): Uint8Array {
    const signature = p256.Signature.fromBytes(der, 'der');
    const order = p256.Point.Fn.ORDER;
    const lowS = signature.hasHighS() ? new p256.Signature(signature.r, order - signature.s) : signature;
    return lowS.toBytes('compact');
  }

  requireSigned(challenge: Uint8Array, publicKey: Uint8Array): void {
    const clientData = JSON.parse(new TextDecoder().decode(this.clientDataJson)) as Record<string, unknown>;
    if (clientData.type !== 'webauthn.get' || clientData.challenge !== PasskeyAssertion.challengeOf(challenge)) {
      throw new Error('The confirmation was for something else');
    }
    const message = concatBytes(this.authenticatorData, sha256(this.clientDataJson));
    if (!p256.verify(this.signature, message, publicKey)) {
      throw new Error("That wasn't the sign-in you set Loop up with. Try again and pick the one for Loop.");
    }
  }

  toJson(publicKey: Uint8Array): PasskeySignature {
    return {
      publicKey: base64.encode(publicKey),
      authenticatorData: base64.encode(this.authenticatorData),
      clientDataJson: base64.encode(this.clientDataJson),
      signature: base64.encode(this.signature),
    };
  }
}
