import type { PaymentLock } from './payment-sender.ts';

const tails = new Map<string, Promise<unknown>>();

export const memoryLock: PaymentLock = {
  exclusive<T>(name: string, task: () => Promise<T>): Promise<T> {
    const result = (tails.get(name) ?? Promise.resolve()).then(task);
    const tail = result.catch(() => undefined);
    tails.set(name, tail);
    void tail.then(() => {
      if (tails.get(name) === tail) {
        tails.delete(name);
      }
    });
    return result;
  },
};
