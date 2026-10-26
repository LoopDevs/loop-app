export function currencyRefusalMessage(errorName: string | undefined, symbol: string): string | null {
  switch (errorName) {
    case 'ErrCashbackNotStable':
      return `Can't earn cashback paying in ${symbol}. Pick another currency.`;
    case 'ErrRateUnavailable':
      return `Can't price this card in ${symbol}`;
    default:
      return null;
  }
}
