import { BankWithdrawalForm } from '@/ctx/bank-withdrawal';
import type { BankWithdrawal } from '@/ctx/client';
import { InFlightPayments } from '@/ctx/in-flight-payments';
import type { SendOutcome } from '@/ctx/payment-sender';
import type { PaymentState } from '@/ctx/payment-state';
import { paymentSender } from '@/ctx/wallet-payments';
import { holdCriticalReload } from '@/updates/update-checker';
import type { SmartWallet } from '@/wallet/smart-wallet';

export class WithdrawalPayment {
  static readonly mismatchMessage =
    "This withdrawal doesn't match what you confirmed, so nothing was sent. It closes by itself.";

  private static readonly inFlight = new InFlightPayments();

  static failureText(state: PaymentState): string {
    if (state.kind === 'notSent' && state.detail !== '') {
      return state.detail;
    }
    if (state.kind === 'failed' && state.contactSupport) {
      return "We couldn't confirm this payment.";
    }
    return state.kind === 'failed' ? 'Payment failed' : "Payment couldn't be sent";
  }

  static send(wallet: SmartWallet, withdrawal: BankWithdrawal, confirmed: string): Promise<SendOutcome> | null {
    if (!BankWithdrawalForm.matchesConfirmed(withdrawal, confirmed)) {
      return Promise.reject(new Error(WithdrawalPayment.mismatchMessage));
    }
    return WithdrawalPayment.inFlight.start(withdrawal.paymentId, () =>
      holdCriticalReload(() => paymentSender.send(withdrawal.paymentId, () => wallet.pay(withdrawal))),
    );
  }
}
