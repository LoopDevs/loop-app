import type { GiftCard } from './client.ts';
import type { ShownOrder } from './one-tap-buy.ts';

type BankOrder = Pick<GiftCard, 'status' | 'paymentStatus' | 'paymentMethod' | 'paymentUrl' | 'paymentUrlExpiration'>;

type BankProfile = {
  stableCurrency?: string;
};

export class BankPayment {
  static readonly option = 'bank';
  static readonly method = 'plaid-uk-eu';
  static readonly currency = 'GBP';
  static readonly stable = 'XLM.GBPLOOP';

  static accepts(merchantCurrency: string): boolean {
    return merchantCurrency === BankPayment.currency;
  }

  static offered(merchantCurrency: string, profile: BankProfile): boolean {
    return BankPayment.accepts(merchantCurrency) && profile.stableCurrency === BankPayment.stable;
  }

  static isBank(order: Pick<GiftCard, 'paymentMethod'>): boolean {
    return order.paymentMethod === BankPayment.method;
  }

  static charged(order: Pick<GiftCard, 'paymentStatus'>): boolean {
    return order.paymentStatus === 'paid';
  }

  static openLink(order: BankOrder): string | null {
    return BankPayment.awaitingApproval(order) && order.paymentUrl ? order.paymentUrl : null;
  }

  static link(order: BankOrder, now: number): string | null {
    return BankPayment.linkExpired(order, now) ? null : BankPayment.openLink(order);
  }

  static linkExpired(order: BankOrder, now: number): boolean {
    if (!BankPayment.awaitingApproval(order)) {
      return false;
    }
    const expiresAt = Date.parse(order.paymentUrlExpiration ?? '');
    return Number.isNaN(expiresAt) || expiresAt <= now;
  }

  static resumed(order: GiftCard, now: number): ShownOrder | null {
    if (order.status === 'unpaid') {
      if (!BankPayment.link(order, now)) {
        return null;
      }
      return { order, payment: { kind: 'bank' }, follow: true, sent: null };
    }
    return { order, payment: { kind: 'ready' }, follow: order.status === 'paid', sent: null };
  }

  static refusalMessage(errorName: string | undefined): string | null {
    switch (errorName) {
      case 'ErrBankPaymentIdentityRequired':
        return 'Add the name on your bank account to pay by bank.';
      case 'ErrCashbackStableMismatch':
      case 'ErrCashbackNotStable':
        return 'Bank payments pay cashback in pounds, which your account is not set up for. Pay from your wallet instead.';
      case 'ErrCurrencyInvalid':
      case 'ErrBankLinkNotEnabled':
        return "Bank payments aren't available on your account yet. Pay from your wallet instead.";
      default:
        return null;
    }
  }

  private static awaitingApproval(order: BankOrder): boolean {
    return BankPayment.isBank(order) && order.status === 'unpaid';
  }
}
