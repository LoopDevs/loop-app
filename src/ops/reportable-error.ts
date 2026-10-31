import { CtxError } from '../ctx/ctx-error.ts';
import { UnexpectedResponse } from '../ctx/ctx-response.ts';
import { RequestTimeoutError } from '../ctx/deadline.ts';
import { UpdateInProgress } from '../updates/critical-update.ts';
import { IdentityNotConfirmed } from '../wallet/device-key.ts';
import { isUserCancel } from '../wallet/user-cancel.ts';

const NETWORK_FAILURE =
  /network request failed|failed to fetch|load failed|network connection|internet connection|appears to be offline|networkerror when attempting|unable to resolve host|failed to connect|software caused connection abort/i;

export class ReportableError {
  static isAnomaly(error: unknown): boolean {
    for (let current = error, depth = 0; depth < 5; depth += 1) {
      if (ReportableError.isExpected(current)) {
        return false;
      }
      if (!(current instanceof Error) || current.cause === undefined) {
        return true;
      }
      current = current.cause;
    }
    return true;
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

  private static isExpected(error: unknown): boolean {
    return (
      error instanceof CtxError ||
      error instanceof UnexpectedResponse ||
      error instanceof IdentityNotConfirmed ||
      error instanceof RequestTimeoutError ||
      error instanceof UpdateInProgress ||
      isUserCancel(error) ||
      ReportableError.isNetworkFailure(error)
    );
  }

  private static isNetworkFailure(error: unknown): boolean {
    return error instanceof Error && NETWORK_FAILURE.test(error.message);
  }
}
