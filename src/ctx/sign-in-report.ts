import { signInRefusalMessage, type SignInMethod } from '../session/social-sign-in.ts';
import { CtxError } from './ctx-error.ts';
import { serviceState } from './service-state.ts';

export function signInReportMessage(method: SignInMethod, error: CtxError): string | null {
  const errorName = error.errorName();
  const expected =
    error.status === 401 ||
    error.status === 429 ||
    error.status >= 500 ||
    serviceState(errorName) !== null ||
    signInRefusalMessage(method, errorName) !== null ||
    (errorName !== undefined && Object.hasOwn(CtxError.knownMessages, errorName));
  if (expected) {
    return null;
  }
  return errorName
    ? `CTX sign-in with ${method} ${error.status} ${errorName}`
    : `CTX sign-in with ${method} ${error.status}`;
}
