import { p256 } from '@noble/curves/nist';

const coordinatesLength = 64;
const uncompressedPointPrefix = 0x04;
const p256SpkiHeader = Uint8Array.of(
  0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
  0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
);

export class PasskeyPublicKey {
  static uncompressedPoint(decoded: Uint8Array): Uint8Array {
    if (decoded.length === coordinatesLength) {
      return PasskeyPublicKey.onCurve(Uint8Array.of(uncompressedPointPrefix, ...decoded));
    }
    if (PasskeyPublicKey.isP256Spki(decoded)) {
      return PasskeyPublicKey.onCurve(decoded.slice(p256SpkiHeader.length));
    }
    throw new Error('The passkey is not a P-256 key');
  }

  private static onCurve(point: Uint8Array): Uint8Array {
    try {
      p256.Point.fromBytes(point);
    } catch {
      throw new Error('The passkey is not a P-256 key');
    }
    return point;
  }

  private static isP256Spki(decoded: Uint8Array): boolean {
    return (
      decoded.length === p256SpkiHeader.length + 1 + coordinatesLength &&
      p256SpkiHeader.every((byte, index) => decoded[index] === byte) &&
      decoded[p256SpkiHeader.length] === uncompressedPointPrefix
    );
  }
}
