import { deviceLocale } from './locale.ts';
import { stablePeg, type PaymentCurrency } from './stellar/network.ts';
import { units } from './stellar/units.ts';

const decimalPattern = /^(\d+)(?:\.(\d+))?$/;

function isPegged(currency: string): currency is PaymentCurrency {
  return Object.hasOwn(stablePeg, currency);
}

function tokenSymbol(currency: string): string {
  return currency.replace(/^XLM\./, '');
}

function exactDecimal(amount: string, locale = deviceLocale()): string {
  const [whole, fraction = ''] = amount.split('.');
  const wholeText = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Number(whole));
  if (!fraction) {
    return wholeText;
  }
  const separator =
    new Intl.NumberFormat(locale).formatToParts(1.5).find((part) => part.type === 'decimal')?.value ?? '.';
  return `${wholeText}${separator}${fraction}`;
}

function trimmedFraction(amount: string): string {
  const [whole, fraction = ''] = amount.split('.');
  return `${whole}.${fraction.replace(/0+$/, '').padEnd(2, '0')}`;
}

export const money = {
  fiat(amount: string, currency: string, locale = deviceLocale()): string {
    const match = decimalPattern.exec(amount.trim());
    if (!match) {
      return `${amount} ${currency}`;
    }
    try {
      const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency });
      const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
      const [, whole, fraction = ''] = match;
      return formatter.format(Number(`${whole}.${fraction.padEnd(digits, '0').slice(0, digits)}`));
    } catch {
      return `${amount} ${currency}`;
    }
  },

  token(amount: bigint, currency: PaymentCurrency, locale = deviceLocale()): string {
    const peg = stablePeg[currency];
    if (peg) {
      return money.fiat(units.format(amount, 7), peg, locale);
    }
    return `${exactDecimal(units.format(amount), locale)} ${tokenSymbol(currency)}`;
  },

  ctx(amount: string, currency: string, locale = deviceLocale()): string {
    if (!isPegged(currency)) {
      return money.fiat(amount, currency, locale);
    }
    try {
      return money.token(units.parse(amount), currency, locale);
    } catch {
      return `${amount} ${currency}`;
    }
  },

  payment(amount: string, currency: string, locale = deviceLocale()): string {
    const symbol = tokenSymbol(currency);
    try {
      return `${exactDecimal(trimmedFraction(units.format(units.parse(amount), 7)), locale)} ${symbol}`;
    } catch {
      return `${amount} ${symbol}`;
    }
  },
};

function formatDate(iso: string, options: Intl.DateTimeFormatOptions, locale = deviceLocale()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(locale, options).format(date);
}

export const dates = {
  day(iso: string, locale = deviceLocale()): string {
    return formatDate(iso, { dateStyle: 'medium' }, locale);
  },

  time(iso: string, locale = deviceLocale()): string {
    return formatDate(iso, { timeStyle: 'short' }, locale);
  },
};
