import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { CtxError, type GiftCard } from '@/ctx/client';
import { paymentLock } from '@/ctx/payment-lock';
import { PaymentSender } from '@/ctx/payment-sender';
import type { PayRejection } from '@/ctx/payment-state';
import { SentPayments } from '@/ctx/sent-payments';
import { PaymentCheck, type OrderPayment } from '@/wallet/payment-search';
import { PendingWithdrawals } from '@/wallet/pending-withdrawals';
import { SmartWallet, WalletBlocked } from '@/wallet/smart-wallet';

function payRejection(error: unknown): PayRejection | undefined {
  if (!(error instanceof CtxError)) {
    return undefined;
  }
  return {
    status: error.status,
    errorName: error.errorName(),
    message: error.bodyField('message'),
    txId: error.bodyField('txId'),
  };
}

export const sentPayments = new SentPayments(AsyncStorage);
export const paymentSender = new PaymentSender(sentPayments, payRejection, paymentLock);
export const pendingTopUps = new PendingWithdrawals(AsyncStorage);

export function paymentCheck(): PaymentCheck {
  return new PaymentCheck(sentPayments, () =>
    SmartWallet.load().catch((error: unknown) => {
      if (error instanceof WalletBlocked) {
        return error.wallet;
      }
      throw error;
    }),
  );
}

export function usePaymentSent(giftCard: GiftCard): OrderPayment | undefined {
  const [checked, setChecked] = useState<{ paymentId: string; payment: OrderPayment } | null>(null);
  useEffect(() => {
    let active = true;
    paymentCheck()
      .sent(giftCard)
      .then((payment) => {
        if (active) {
          setChecked({ paymentId: giftCard.paymentId, payment });
        }
      });
    return () => {
      active = false;
    };
  }, [giftCard]);
  return checked?.paymentId === giftCard.paymentId ? checked.payment : undefined;
}
