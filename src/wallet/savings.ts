import { network, type PaymentCurrency } from '../stellar/network.ts';
import { units } from '../stellar/units.ts';

export type SavingsBalance = {
  currency: PaymentCurrency;
  shares: bigint;
  value: bigint;
};

const basisPointsPerWhole = 10_000;

export class SavingsRate {
  static readonly fixedBasisPoints: Partial<Record<PaymentCurrency, number>> = { 'XLM.GBPLOOP': 400 };
  static readonly dayMs = 24 * 60 * 60 * 1000;
  static readonly yearMs = 365 * SavingsRate.dayMs;

  readonly basisPoints: number;

  constructor(basisPoints: number) {
    this.basisPoints = basisPoints;
  }

  static fixedFor(currency: string | null | undefined): SavingsRate | null {
    const basisPoints = Savings.takes(currency) ? SavingsRate.fixedBasisPoints[currency] : undefined;
    return basisPoints === undefined ? null : new SavingsRate(basisPoints);
  }

  figure(locale?: string): string {
    const format = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 });
    return format.format(this.basisPoints / basisPointsPerWhole);
  }

  headline(locale?: string): string {
    return `Earn ${this.figure(locale)} a year`;
  }

  sinceDailyStep(now: number): number {
    return now % SavingsRate.dayMs;
  }

  projected(value: bigint, now: number): number {
    const yearly = this.basisPoints / basisPointsPerWhole;
    const grown = 1 + (yearly * this.sinceDailyStep(now)) / SavingsRate.yearMs;
    return (Number(value) / 10 ** units.decimals) * grown;
  }
}

export class Savings {
  static get currencies(): PaymentCurrency[] {
    return Object.keys(network.vaults) as PaymentCurrency[];
  }
  static readonly maxYearlyRatePercent = 5;
  static readonly riskShort = 'Its value can go down as well as up';
  static readonly riskNote =
    "Savings isn't a bank account and isn't covered by any deposit protection scheme. Its value can go down as well as up, so you could get back less than you put in. The rate is variable and can go up or down, and past returns are not a guide to future returns.";

  static rateHeadline(currency?: string | null, locale?: string): string {
    const fixed = SavingsRate.fixedFor(currency);
    return fixed ? fixed.headline(locale) : `Earn up to ${Savings.maxYearlyRatePercent}% a year, variable`;
  }

  static takes(currency: string | null | undefined): currency is PaymentCurrency {
    return typeof currency === 'string' && Object.hasOwn(network.vaults, currency);
  }

  static vault(currency: PaymentCurrency): string {
    const vault = network.vaults[currency];
    if (!vault) {
      throw new Error(`Savings has no vault for ${currency}`);
    }
    return vault;
  }
}
