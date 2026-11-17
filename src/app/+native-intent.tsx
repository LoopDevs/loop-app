import { BankLink } from '@/ctx/bank-link';

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  if (!BankLink.isReturn(path)) {
    return BankLink.orderReturn(path) ?? path;
  }
  return initial ? '/' : null;
}
