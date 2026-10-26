import type { GiftCard } from '../ctx/client.ts';
import {
  landingClosed,
  sentTransactionOutcome,
  type PaymentState,
  type SignedTransfer,
} from '../ctx/payment-state.ts';
import type { Token } from '../stellar/network.ts';
import { units } from '../stellar/units.ts';

export type Payable = Pick<GiftCard, 'paymentId' | 'paymentCryptoCurrency' | 'paymentCryptoAmount'>;

export type SentTransaction = {
  txId?: string;
  expiryLedger?: number;
  transfer?: SignedTransfer;
};

export type PaymentChain = {
  tokens: readonly Token[];
  transaction(hash: string): Promise<{ status: string; latestLedger: number }>;
  latestLedger(): Promise<number>;
  landed(token: Token, expected: SignedTransfer | null, expiryLedger: number): Promise<boolean>;
};

export class SentPaymentCheck {
  private readonly chain: PaymentChain;

  constructor(chain: PaymentChain) {
    this.chain = chain;
  }

  async failure(payable: Payable, { txId, expiryLedger, transfer }: SentTransaction): Promise<PaymentState | null> {
    if (txId) {
      const outcome = sentTransactionOutcome(await this.chain.transaction(txId), expiryLedger);
      return outcome === 'failed' ? { kind: 'failed' } : null;
    }
    const token = this.chain.tokens.find((candidate) => candidate.currency === payable.paymentCryptoCurrency);
    if (expiryLedger === undefined || !token || !landingClosed(await this.chain.latestLedger(), expiryLedger)) {
      return null;
    }
    if (await this.chain.landed(token, transfer ?? SentPaymentCheck.priceTransfer(payable), expiryLedger)) {
      return null;
    }
    return { kind: 'failed', contactSupport: true };
  }

  private static priceTransfer(payable: Payable): SignedTransfer | null {
    if (!payable.paymentCryptoAmount) {
      return null;
    }
    try {
      return { amount: units.parse(payable.paymentCryptoAmount) };
    } catch {
      return null;
    }
  }
}
