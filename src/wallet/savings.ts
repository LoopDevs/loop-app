import { network, type PaymentCurrency } from '../stellar/network.ts';

export type SavingsBalance = {
  currency: PaymentCurrency;
  shares: bigint;
  value: bigint;
};

export class Savings {
  static get currencies(): PaymentCurrency[] {
    return Object.keys(network.vaults) as PaymentCurrency[];
  }
  static readonly maxYearlyRatePercent = 5;
  static readonly rateHeadline = `Earn up to ${Savings.maxYearlyRatePercent}% a year, variable`;
  static readonly riskShort = 'Its value can go down as well as up';
  static readonly riskNote =
    "Savings isn't a bank account and isn't covered by any deposit protection scheme. Its value can go down as well as up, so you could get back less than you put in. The rate is variable and can go up or down, and past returns are not a guide to future returns.";

  static takes(currency: string | undefined): currency is PaymentCurrency {
    return currency !== undefined && Object.hasOwn(network.vaults, currency);
  }

  static vault(currency: PaymentCurrency): string {
    const vault = network.vaults[currency];
    if (!vault) {
      throw new Error(`Savings has no vault for ${currency}`);
    }
    return vault;
  }
}
