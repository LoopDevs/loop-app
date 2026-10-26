import { rateLimitedMessage } from './payment-state.ts';
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

  private static displayMessage(status: number, body: string): string {
    if (status === 429) {
      return rateLimitedMessage;
    }
    const state = serviceState(CtxError.field(body, 'error'));
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
