import { ReportableError } from '../ops/reportable-error.ts';

export type FailureReporter = (error: unknown, context: string) => unknown;

export async function reportingSigningFailure<T>(
  signer: string,
  report: FailureReporter,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (ReportableError.isAnomaly(error)) {
      report(error, `Signing with ${signer}`);
    }
    throw error;
  }
}
