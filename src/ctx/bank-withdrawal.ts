import type { PaymentCurrency } from '../stellar/network.ts';
import { units } from '../stellar/units.ts';
import { normalizeAmount } from './amount-input.ts';
import { PriceWindow } from './price-window.ts';

export const bankWithdrawalStatuses = [
  'awaiting-payment',
  'expired',
  'in-review',
  'paying',
  'burning',
  'paid',
  'rejected',
  'returning',
  'returned',
] as const;

export type BankWithdrawalStatus = (typeof bankWithdrawalStatuses)[number];

export type BankWithdrawalJson = {
  id: string;
  status: BankWithdrawalStatus;
  amount: string;
  currency: string;
  accountName: string;
  sortCode: string;
  accountNumberLast4: string;
  paymentId: string;
  created: string;
  paymentUrlExpiration?: string;
};

export type BankWithdrawalIn = {
  currency: PaymentCurrency;
  amount: string;
  sortCode: string;
  accountNumber: string;
};

export type BankWithdrawalProgress = {
  headline: string;
  detail: string;
  step: number | null;
};

export class BankWithdrawal {
  static readonly currency: PaymentCurrency = 'XLM.GBPLOOP';
  static readonly smallest = '10';
  static readonly largest = '1000';
  static readonly sortCodeLength = 6;
  static readonly accountNumberLength = 8;
  static readonly steps = [
    { label: 'Requested', detail: 'We have your request.' },
    { label: 'Reviewing', detail: 'We check every cash out to keep your money safe.' },
    { label: 'Paid', detail: 'Usually within 1 working day.' },
  ];

  readonly id: string;
  readonly status: BankWithdrawalStatus;
  readonly amount: string;
  readonly currency: string;
  readonly accountName: string;
  readonly sortCode: string;
  readonly accountNumberLast4: string;
  readonly paymentId: string;
  readonly created: string;
  readonly paymentUrlExpiration?: string;

  constructor(json: BankWithdrawalJson) {
    this.id = json.id;
    this.status = json.status;
    this.amount = json.amount;
    this.currency = json.currency;
    this.accountName = json.accountName;
    this.sortCode = json.sortCode;
    this.accountNumberLast4 = json.accountNumberLast4;
    this.paymentId = json.paymentId;
    this.created = json.created;
    this.paymentUrlExpiration = json.paymentUrlExpiration;
  }

  static digits(input: string, length: number): string {
    return input.replace(/\D/g, '').slice(0, length);
  }

  static shownSortCode(sortCode: string): string {
    return sortCode.match(/.{1,2}/g)?.join('-') ?? '';
  }

  static accountReady(sortCode: string, accountNumber: string): boolean {
    return (
      sortCode.length === BankWithdrawal.sortCodeLength && accountNumber.length === BankWithdrawal.accountNumberLength
    );
  }

  static largestFor(available: bigint): bigint {
    const largest = units.parse(BankWithdrawal.largest);
    const wholePence = available - (available % units.parse('0.01'));
    return wholePence < largest ? wholePence : largest;
  }

  static amountOf(input: string, available: bigint): bigint | null {
    const normalized = normalizeAmount(input);
    if (normalized === null || !/^\d+(\.\d{1,2})?$/.test(normalized)) {
      return null;
    }
    const amount = units.parse(normalized);
    const inRange = amount >= units.parse(BankWithdrawal.smallest) && amount <= BankWithdrawal.largestFor(available);
    return inRange ? amount : null;
  }

  static request(amount: bigint, sortCode: string, accountNumber: string): BankWithdrawalIn {
    return {
      currency: BankWithdrawal.currency,
      amount: units.format(amount, 2),
      sortCode,
      accountNumber,
    };
  }

  tokenAmount(): bigint {
    return units.parse(this.amount);
  }

  answers(request: BankWithdrawalIn): boolean {
    return (
      this.status === 'awaiting-payment' &&
      this.currency === request.currency &&
      this.tokenAmount() === units.parse(request.amount) &&
      this.sortCode === request.sortCode &&
      this.accountNumberLast4 === request.accountNumber.slice(-4)
    );
  }

  isAwaitingPayment(): boolean {
    return this.status === 'awaiting-payment';
  }

  isSettled(): boolean {
    return this.status === 'paid' || this.status === 'returned' || this.status === 'expired';
  }

  payWindow(): PriceWindow | null {
    const expiresAt = this.paymentUrlExpiration ? Date.parse(this.paymentUrlExpiration) : Number.NaN;
    return Number.isNaN(expiresAt) ? null : new PriceWindow(expiresAt);
  }

  progress(shownAmount: string): BankWithdrawalProgress {
    switch (this.status) {
      case 'awaiting-payment':
        return { headline: `Sending ${shownAmount}`, detail: 'This takes a moment.', step: 0 };
      case 'in-review':
        return { headline: `${shownAmount} is on its way`, detail: this.destination(), step: 1 };
      case 'paying':
      case 'burning':
        return { headline: `${shownAmount} is on its way`, detail: this.destination(), step: 2 };
      case 'paid':
        return { headline: `${shownAmount} paid`, detail: this.destination(), step: BankWithdrawal.steps.length };
      case 'rejected':
      case 'returning':
        return {
          headline: "We couldn't pay this cash out",
          detail: `${shownAmount} is on its way back to your Loop account.`,
          step: null,
        };
      case 'returned':
        return {
          headline: "We couldn't pay this cash out",
          detail: `${shownAmount} is back in your Loop account.`,
          step: null,
        };
      case 'expired':
        return {
          headline: 'This cash out ran out of time',
          detail: 'Any money that left your Loop account for it will be sent back.',
          step: null,
        };
    }
  }

  destination(): string {
    return `To ${this.accountName}, account ending ${this.accountNumberLast4}.`;
  }
}
