const decimalAmount = /^\d+(\.\d+)?$/;
const decimalCommaAmount = /^\d+,\d{1,2}$/;

export const invalidAmountMessage = 'Enter an amount like 25 or 25.50';

export function normalizeAmount(input: string): string | null {
  const trimmed = input.trim();
  const dotted = decimalCommaAmount.test(trimmed) ? trimmed.replace(',', '.') : trimmed;
  return decimalAmount.test(dotted) ? dotted : null;
}
