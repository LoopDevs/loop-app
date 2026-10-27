import { CtxError } from '../ctx/ctx-error.ts';
import { RequestTimeoutError } from '../ctx/deadline.ts';
import { IdentityNotConfirmed } from '../wallet/device-key.ts';
import { isUserCancel } from '../wallet/user-cancel.ts';

const NETWORK_FAILURE = /network request failed|failed to fetch|load failed|network connection|internet connection/i;

export class ReportableError {
  static isAnomaly(error: unknown): boolean {
    return !(
      error instanceof CtxError ||
      error instanceof IdentityNotConfirmed ||
      error instanceof RequestTimeoutError ||
      isUserCancel(error) ||
      ReportableError.isNetworkFailure(error)
    );
  }

  static summary(error: unknown, context: string): Error {
    const name = error instanceof Error ? error.name : 'NonError';
    const summary = new Error(`${context} failed: ${name}`);
    summary.name = name;
    if (error instanceof Error && error.stack) {
      summary.stack = error.stack;
    }
    return summary;
  }

  private static isNetworkFailure(error: unknown): boolean {
    return error instanceof TypeError && NETWORK_FAILURE.test(error.message);
  }
}
