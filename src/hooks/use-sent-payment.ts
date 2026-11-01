import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import type { GiftCard } from '@/ctx/client';
import { SentPayments } from '@/ctx/sent-payments';
import { PaymentCheck, type OrderPayment } from '@/wallet/payment-search';
import { SmartWallet, WalletBlocked } from '@/wallet/smart-wallet';

export const sentPayments = new SentPayments(AsyncStorage);

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
