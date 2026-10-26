import type { PaymentCurrency } from '../stellar/network.ts';

export class Savings {
  static readonly currency: PaymentCurrency = 'XLM.USDC';

  static takes(currency: string | undefined): boolean {
    return currency === Savings.currency;
  }
}
