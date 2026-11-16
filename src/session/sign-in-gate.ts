const firstRetryMs = 2_000;
const longestRetryMs = 30_000;

export class SignInGate {
  static next(previous: boolean | null, current: boolean): boolean {
    if (previous === null) {
      return current;
    }
    return previous && current;
  }

  static retryDelayMs(failures: number): number {
    return Math.min(firstRetryMs * 2 ** failures, longestRetryMs);
  }
}
