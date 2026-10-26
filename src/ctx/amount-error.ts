import type { MerchantJson } from './client';

type AmountRules = Pick<MerchantJson, 'currency'> & { denominationValues: string[] };

export function amountErrorMessage(errorName: string | undefined, merchant: AmountRules): string | null {
  const [min, max] = merchant.denominationValues;
  switch (errorName) {
    case 'ErrAmountBelowMinimum':
      return `Minimum is ${min} ${merchant.currency}`;
    case 'ErrAmountAboveMaximum':
      return `Maximum is ${max} ${merchant.currency}`;
    case 'ErrAmountDenominationInvalid':
      return `Choose one of ${merchant.denominationValues.join(', ')}`;
    case 'ErrAmountFractional':
      return 'Whole amounts only';
    case 'ErrNoDiscountsAvailable':
      return "This amount isn't available right now, try another";
    default:
      return null;
  }
}
