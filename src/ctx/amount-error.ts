import type { MerchantJson } from './client';

type AmountRules = Pick<MerchantJson, 'currency' | 'denominations'>;

export function amountErrorMessage(errorName: string | undefined, merchant: AmountRules): string | null {
  const [min, max] = merchant.denominations;
  switch (errorName) {
    case 'ErrAmountBelowMinimum':
      return `Minimum is ${min} ${merchant.currency}`;
    case 'ErrAmountAboveMaximum':
      return `Maximum is ${max} ${merchant.currency}`;
    case 'ErrAmountDenominationInvalid':
      return `Choose one of ${merchant.denominations.join(', ')}`;
    case 'ErrAmountFractional':
      return 'Whole amounts only';
    case 'ErrNoDiscountsAvailable':
      return "This amount isn't available right now, try another";
    default:
      return null;
  }
}

type ErrorFields = {
  errorName(): string | undefined;
  bodyField(name: string): string | undefined;
};

export function withdrawalAmountErrorMessage(error: ErrorFields): string | null {
  const min = error.bodyField('min');
  const max = error.bodyField('max');
  switch (error.errorName()) {
    case 'ErrAmountBelowMinimum':
      return min ? `Minimum is ${min}` : null;
    case 'ErrAmountAboveMaximum':
      return max ? `Maximum is ${max}` : null;
    case 'ErrAmountFractional':
      return 'Use whole pence (2 decimal places)';
    default:
      return null;
  }
}
