import { BankLink } from '@/ctx/bank-link';

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  if (!BankLink.isReturn(path)) {
    return path;
  }
  return initial ? '/' : null;
}
