import type { PaymentLock } from '@/ctx/payment-sender';

export const paymentLock: PaymentLock = {
  exclusive<T>(name: string, task: () => Promise<T>): Promise<T> {
    return task();
  },
};
