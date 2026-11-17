import { BankWithdrawal, type BankWithdrawalIn } from '../ctx/bank-withdrawal.ts';
import type { PaymentState } from '../ctx/payment-state.ts';
import type { PriceWindow } from '../ctx/price-window.ts';
import type { TopUpOutcome } from './savings-top-up.ts';

export type CashOutSteps = {
  request(request: BankWithdrawalIn): Promise<BankWithdrawal>;
  recorded(paymentId: string): Promise<PaymentState | null>;
  topUp(amount: bigint, window: PriceWindow): Promise<TopUpOutcome>;
  send(withdrawal: BankWithdrawal): Promise<PaymentState>;
  now(): number;
};

export type CashOutResult =
  | { kind: 'sent'; withdrawal: BankWithdrawal }
  | { kind: 'stopped'; withdrawal: BankWithdrawal; message: string };

export class CashOut {
  static readonly outOfTimeMessage = 'This cash out ran out of time. Try again in a few minutes.';
  static readonly notEnoughMessage = "You don't have enough to cash out that much.";
  static readonly savingsFailedMessage =
    "We couldn't take the money out of savings. Nothing has left your Loop account.";
  static readonly savingsMovingMessage = 'Still taking the money out of savings. Try again in a minute.';
  static readonly failedMessage =
    "The payment didn't go through. Your money is still in your Loop account. Try again in a few minutes.";
  static readonly notSentMessage = "We couldn't send your money. It is still in your Loop account.";
  static readonly differentRequestMessage = 'You already have a cash out waiting. Finish it or try again in a few minutes.';
  static readonly refusalMessages: Readonly<Record<string, string>> = {
    ErrBankWithdrawalOpen: 'You already have a cash out in progress. Try again once it has finished.',
    ErrBankPaymentIdentityRequired: 'Add your first and last name in your profile before you cash out.',
    ErrUserDisabled: 'Cash out is not available on this account. Contact support.',
  };

  private readonly steps: CashOutSteps;

  constructor(steps: CashOutSteps) {
    this.steps = steps;
  }

  static refusalMessage(errorName: string | undefined): string | null {
    return errorName && Object.hasOwn(CashOut.refusalMessages, errorName) ? CashOut.refusalMessages[errorName] : null;
  }

  static topUpMessage(outcome: Exclude<TopUpOutcome, { kind: 'covered' }>): string {
    switch (outcome.kind) {
      case 'priceClosing':
      case 'priceExpired':
        return CashOut.outOfTimeMessage;
      case 'notEnough':
      case 'stillShort':
        return CashOut.notEnoughMessage;
      case 'withdrawFailed':
        return CashOut.savingsFailedMessage;
      case 'stillMoving':
        return CashOut.savingsMovingMessage;
    }
  }

  async start(request: BankWithdrawalIn): Promise<CashOutResult> {
    const withdrawal = await this.steps.request(request);
    if (!withdrawal.answers(request)) {
      return { kind: 'stopped', withdrawal, message: CashOut.differentRequestMessage };
    }
    return this.pay(withdrawal);
  }

  async pay(withdrawal: BankWithdrawal): Promise<CashOutResult> {
    const recorded = await this.steps.recorded(withdrawal.paymentId);
    if (recorded) {
      return CashOut.resultOf(withdrawal, recorded);
    }
    if (!withdrawal.isAwaitingPayment()) {
      return { kind: 'sent', withdrawal };
    }
    if (withdrawal.currency !== BankWithdrawal.currency) {
      return { kind: 'stopped', withdrawal, message: CashOut.notSentMessage };
    }
    const window = withdrawal.payWindow();
    if (!window || window.isClosed(this.steps.now())) {
      return { kind: 'stopped', withdrawal, message: CashOut.outOfTimeMessage };
    }
    const topUp = await this.steps.topUp(withdrawal.tokenAmount(), window);
    if (topUp.kind !== 'covered') {
      return { kind: 'stopped', withdrawal, message: CashOut.topUpMessage(topUp) };
    }
    return CashOut.resultOf(withdrawal, await this.steps.send(withdrawal));
  }

  private static resultOf(withdrawal: BankWithdrawal, state: PaymentState): CashOutResult {
    switch (state.kind) {
      case 'confirming':
        return { kind: 'sent', withdrawal };
      case 'failed':
        return { kind: 'stopped', withdrawal, message: CashOut.failedMessage };
      case 'priceExpired':
        return { kind: 'stopped', withdrawal, message: CashOut.outOfTimeMessage };
      case 'notSent':
        return { kind: 'stopped', withdrawal, message: state.detail || CashOut.notSentMessage };
      default:
        return { kind: 'stopped', withdrawal, message: CashOut.notSentMessage };
    }
  }
}
