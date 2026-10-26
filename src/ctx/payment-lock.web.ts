import type { PaymentLock } from '@/ctx/payment-sender';

export const paymentLock: PaymentLock = {
  exclusive<T>(name: string, task: () => Promise<T>): Promise<T> {
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
    return locks ? locks.request(name, task) : task();
  },
};
