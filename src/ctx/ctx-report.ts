import { serviceState } from './service-state.ts';

export function ctxReportMessage(status: number, errorName: string | undefined): string | null {
  if (status < 500 || serviceState(errorName) !== null) {
    return null;
  }
  return errorName ? `CTX ${status} ${errorName}` : `CTX ${status}`;
}
