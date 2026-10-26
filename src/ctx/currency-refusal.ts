export function refusesCurrency(errorName: string | undefined): boolean {
  return errorName === 'ErrCashbackNotStable';
}

export function currencyRefusalMessage(errorName: string | undefined, symbol: string): string | null {
  switch (errorName) {
    case 'ErrCashbackNotStable':
      return `Can't earn cashback paying in ${symbol}. Pick another currency.`;
    case 'ErrRateUnavailable':
      return `Pricing in ${symbol} is unavailable right now. Try again shortly.`;
    default:
      return null;
  }
}
