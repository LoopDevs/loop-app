import { rateLimitedMessage, type PayRejection } from './payment-state.ts';
import { serviceState, serviceStateMessages } from './service-state.ts';

export class CtxError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(CtxError.displayMessage(status, body));
    this.status = status;
    this.body = body;
  }

  errorName(): string | undefined {
    return this.bodyField('error');
  }

  bodyField(name: string): string | undefined {
    return CtxError.field(this.body, name);
  }

  static readonly savingsUnavailableMessage = "Savings isn't available right now.";

  payRejection(): PayRejection {
    return {
      status: this.status,
      errorName: this.errorName(),
      message: this.bodyField('message'),
      txId: this.bodyField('txId'),
    };
  }

  static payRejectionOf(error: unknown): PayRejection | undefined {
    return error instanceof CtxError ? error.payRejection() : undefined;
  }

  private static displayMessage(status: number, body: string): string {
    if (status === 429) {
      return rateLimitedMessage;
    }
    const name = CtxError.field(body, 'error');
    if (name === 'ErrSavingsUnavailable') {
      return CtxError.savingsUnavailableMessage;
    }
    const state = serviceState(name);
    return state ? serviceStateMessages[state] : `CTX ${status}: ${body}`;
  }

  private static field(body: string, name: string): string | undefined {
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed && typeof parsed === 'object') {
        const value = (parsed as Record<string, unknown>)[name];
        return typeof value === 'string' ? value : undefined;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }
}
