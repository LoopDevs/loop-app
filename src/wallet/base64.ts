export const base64 = {
  encode(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  },

  decode(value: string): Uint8Array {
    const standard = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, '=');
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  },
};
