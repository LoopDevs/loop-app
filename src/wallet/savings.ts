import type { PaymentCurrency } from '../stellar/network.ts';

export class Savings {
  static readonly currency: PaymentCurrency = 'XLM.USDC';
  static readonly maxYearlyRatePercent = 5;
  static readonly rateHeadline = `Earn up to ${Savings.maxYearlyRatePercent}% a year, variable`;
  static readonly riskNote =
    "Savings isn't a bank account. The rate is variable and can go up or down, and past returns are not a guide to future returns.";

  static takes(currency: string | undefined): boolean {
    return currency === Savings.currency;
  }
}
