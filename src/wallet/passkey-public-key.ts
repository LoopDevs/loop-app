const coordinatesLength = 64;
const uncompressedPointLength = 65;
const uncompressedPointPrefix = 0x04;

export class PasskeyPublicKey {
  static uncompressedPoint(decoded: Uint8Array): Uint8Array {
    const point =
      decoded.length === coordinatesLength
        ? Uint8Array.of(uncompressedPointPrefix, ...decoded)
        : decoded.slice(-uncompressedPointLength);
    if (point.length !== uncompressedPointLength || point[0] !== uncompressedPointPrefix) {
      throw new Error('The passkey is not a P-256 key');
    }
    return point;
  }
}
