import { money } from '../money.ts';
import type { PaymentCurrency } from '../stellar/network.ts';
import { units } from '../stellar/units.ts';
import { invalidAmountMessage, normalizeAmount } from './amount-input.ts';
import type { BankWithdrawal } from './client.ts';

export const bankWithdrawalCurrency: PaymentCurrency = 'XLM.GBPLOOP';

export type AmountCheck = { amount: string } | { error: string };

export type BankDetails = {
  sortCode: string;
  accountNumber: string;
};

export type WithdrawalStatusView = {
  lines: string[];
  canFinish: boolean;
};

export class BankWithdrawalForm {
  static readonly pollLimit = 40;

  static maxAmount(balance: bigint): string {
    return units.format(balance, 2);
  }

  static checkAmount(input: string, balance: bigint): AmountCheck {
    const amount = normalizeAmount(input);
    const value = amount === null ? null : units.parseTruncated(amount);
    if (amount === null || value === null) {
      return { error: invalidAmountMessage };
    }
    if (value === 0n) {
      return { error: 'Enter an amount above zero' };
    }
    if (value > balance) {
      return { error: 'More than your GBPLOOP balance' };
    }
    return { amount };
  }

  static sortCode(input: string): string | null {
    const digits = input.replace(/[\s-]/g, '');
    return /^\d{6}$/.test(digits) ? digits : null;
  }

  static accountNumber(input: string): string | null {
    const digits = input.trim();
    return /^\d{8}$/.test(digits) ? digits : null;
  }

  static bankDetails(sortCodeInput: string, accountNumberInput: string): BankDetails | null {
    const sortCode = BankWithdrawalForm.sortCode(sortCodeInput);
    const accountNumber = BankWithdrawalForm.accountNumber(accountNumberInput);
    return sortCode && accountNumber ? { sortCode, accountNumber } : null;
  }

  static shownSortCode(sortCode: string): string {
    return sortCode.match(/\d{2}/g)?.join('-') ?? sortCode;
  }

  static reviewText(amount: string, bank: BankDetails, accountName: string): string {
    const sent = money.payment(amount, bankWithdrawalCurrency);
    const paid = money.fiat(amount, 'GBP');
    const account = `${BankWithdrawalForm.shownSortCode(bank.sortCode)} ••••${bank.accountNumber.slice(-4)}`;
    return `You send ${sent}. We pay ${paid} to ${accountName}, ${account}, after a review.`;
  }

  static matchesConfirmed(withdrawal: BankWithdrawal, confirmed: string): boolean {
    const expected = BankWithdrawalForm.tokenAmount(confirmed);
    return (
      expected !== null &&
      withdrawal.currency === bankWithdrawalCurrency &&
      withdrawal.paymentCryptoCurrency === bankWithdrawalCurrency &&
      BankWithdrawalForm.tokenAmount(withdrawal.amount) === expected &&
      BankWithdrawalForm.tokenAmount(withdrawal.paymentCryptoAmount) === expected
    );
  }

  static canFinish(withdrawal: BankWithdrawal, now: number): boolean {
    if (withdrawal.status !== 'awaiting-payment' || !withdrawal.paymentUrlExpiration) {
      return false;
    }
    const expiresAt = Date.parse(withdrawal.paymentUrlExpiration);
    return !Number.isNaN(expiresAt) && now < expiresAt;
  }

  static status(withdrawal: BankWithdrawal, now: number): WithdrawalStatusView {
    const returned = withdrawal.refundTxId ? ['Returned to your wallet'] : [];
    const reason = withdrawal.reason ? [withdrawal.reason] : [];
    switch (withdrawal.status) {
      case 'awaiting-payment':
        return BankWithdrawalForm.canFinish(withdrawal, now)
          ? { lines: ['Waiting for payment'], canFinish: true }
          : { lines: ['Closing. You can start a new withdrawal in a few minutes.'], canFinish: false };
      case 'in-review':
        return { lines: ['In review'], canFinish: false };
      case 'paying':
        return { lines: ['Sending to your bank'], canFinish: false };
      case 'paid':
        return {
          lines: ['Paid', ...(withdrawal.bankReference ? [`Reference ${withdrawal.bankReference}`] : [])],
          canFinish: false,
        };
      case 'rejected':
        return {
          lines: [withdrawal.refundTxId ? 'Returned to your wallet' : 'Not approved, returning GBPLOOP', ...reason],
          canFinish: false,
        };
      case 'expired':
        return { lines: ['Expired', ...reason, ...returned], canFinish: false };
      default: {
        const unknown: never = withdrawal.status;
        return { lines: [unknown], canFinish: false };
      }
    }
  }

  static submittedHeading(withdrawal: BankWithdrawal): string | null {
    switch (withdrawal.status) {
      case 'awaiting-payment':
        return 'Payment sent, waiting for confirmation';
      case 'in-review':
        return 'Withdrawal in review';
      default:
        return null;
    }
  }

  private static tokenAmount(amount: string | undefined): bigint | null {
    if (amount === undefined) {
      return null;
    }
    try {
      return units.parse(amount);
    } catch {
      return null;
    }
  }
}
