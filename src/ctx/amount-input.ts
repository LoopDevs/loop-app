const decimalAmount = /^\d+(\.\d+)?$/;

export const invalidAmountMessage = 'Enter an amount like 25 or 25.50';

export function normalizeAmount(input: string): string | null {
  const trimmed = input.trim();
  const commas = trimmed.split(',').length - 1;
  const dotted = commas === 1 && !trimmed.includes('.') ? trimmed.replace(',', '.') : trimmed;
  return decimalAmount.test(dotted) ? dotted : null;
}
