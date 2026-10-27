import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { SentPayments, type SentPayment } from '@/ctx/sent-payments';

export const sentPayments = new SentPayments(AsyncStorage);

export function useSentPayment(paymentId: string): SentPayment | null {
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
      },
    );
    return () => {
      active = false;
    };
  }, [paymentId]);
  return sent?.paymentId === paymentId ? sent.record : null;
}
