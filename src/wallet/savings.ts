import type { PaymentCurrency } from '../stellar/network.ts';

export class Savings {
  static readonly currency: PaymentCurrency = 'XLM.USDC';
  static readonly maxYearlyRatePercent = 5;
  static readonly rateHeadline = `Earn up to ${Savings.maxYearlyRatePercent}% a year, variable`;
  static readonly riskShort = 'Its value can go down as well as up';
  static readonly riskNote =
    "Savings isn't a bank account and isn't covered by any deposit protection scheme. Its value can go down as well as up, so you could get back less than you put in. The rate is variable and can go up or down, and past returns are not a guide to future returns.";

  static takes(currency: string | undefined): boolean {
    return currency === Savings.currency;
  }
}
