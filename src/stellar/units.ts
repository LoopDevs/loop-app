const decimals = 7;
const scale = 10n ** BigInt(decimals);
const decimalPattern = /^(\d+)(?:\.(\d{1,7}))?$/;

export const units = {
  decimals,

  parse(amount: string): bigint {
    const match = decimalPattern.exec(amount.trim());
    if (!match) {
      throw new Error(`Invalid token amount: ${amount}`);
    }
    const [, whole, fraction = ''] = match;
    return BigInt(whole) * scale + BigInt(fraction.padEnd(decimals, '0'));
  },

  parseTruncated(amount: string): bigint | null {
    const match = /^(\d+)(?:\.(\d+))?$/.exec(amount.trim());
    if (!match) {
      return null;
    }
    const [, whole, fraction = ''] = match;
    return BigInt(whole) * scale + BigInt(fraction.slice(0, decimals).padEnd(decimals, '0'));
  },

  format(amount: bigint, shownDecimals = 2): string {
    const sign = amount < 0n ? '-' : '';
    const magnitude = amount < 0n ? -amount : amount;
    const fraction = (magnitude % scale).toString().padStart(decimals, '0').slice(0, shownDecimals);
    return `${sign}${magnitude / scale}.${fraction}`;
  },
};
