import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import type { GiftCard } from '@/ctx/client';
import { needsPaymentSearch } from '@/ctx/gift-card-status';
import { SentPayments, type SentPayment } from '@/ctx/sent-payments';
import { SmartWallet, UnlinkedDevice } from '@/wallet/smart-wallet';

export const sentPayments = new SentPayments(AsyncStorage);

export class PaymentCheck {
  private payer: Promise<SmartWallet | null> | null = null;

  async sent(giftCard: GiftCard): Promise<boolean> {
    if ((await sentPayments.get(giftCard.paymentId).catch(() => null)) !== null) {
      return true;
    }
    if (!needsPaymentSearch(giftCard)) {
      return false;
    }
    try {
      const wallet = await this.wallet();
      return wallet ? await wallet.orderPaid(giftCard) : false;
    } catch (error) {
      console.warn('Searching the wallet for the order payment failed', error);
      return false;
    }
  }

  private wallet(): Promise<SmartWallet | null> {
    this.payer ??= SmartWallet.load().catch((error: unknown) => {
      if (error instanceof UnlinkedDevice) {
        return error.wallet;
      }
      throw error;
    });
    return this.payer;
  }
}

export function usePaymentSent(giftCard: GiftCard): boolean | undefined {
  const [checked, setChecked] = useState<{ paymentId: string; sent: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    new PaymentCheck().sent(giftCard).then((sent) => {
      if (active) {
        setChecked({ paymentId: giftCard.paymentId, sent });
      }
    });
    return () => {
      active = false;
    };
  }, [giftCard]);
  return checked?.paymentId === giftCard.paymentId ? checked.sent : undefined;
}

export function useSentPayment(paymentId: string): SentPayment | null | undefined {
  const [sent, setSent] = useState<{ paymentId: string; record: SentPayment | null } | null>(null);
  useEffect(() => {
    let active = true;
    sentPayments.get(paymentId).then(
      (record) => {
        if (active) {
          setSent({ paymentId, record });
        }
      },
      (error: unknown) => {
        console.warn('Reading the sent payment failed', error);
        if (active) {
          setSent({ paymentId, record: null });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [paymentId]);
  return sent?.paymentId === paymentId ? sent.record : undefined;
}
