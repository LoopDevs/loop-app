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

  format(amount: bigint, shownDecimals = 2): string {
    const fraction = (amount % scale).toString().padStart(decimals, '0').slice(0, shownDecimals);
    return `${amount / scale}.${fraction}`;
  },
};
