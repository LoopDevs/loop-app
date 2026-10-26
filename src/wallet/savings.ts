import type { PaymentCurrency } from '../stellar/network.ts';

export class Savings {
  static readonly currency: PaymentCurrency = 'XLM.USDC';
  static readonly maxYearlyRatePercent = 5;
  static readonly rateHeadline = `Earn up to ${Savings.maxYearlyRatePercent}% a year, variable`;

  static takes(currency: string | undefined): boolean {
    return currency === Savings.currency;
  }
}
