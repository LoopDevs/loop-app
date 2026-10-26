export class Savings {
  static readonly currency = 'XLM.USDC';

  static takes(currency: string | undefined): boolean {
    return currency === Savings.currency;
  }
}
