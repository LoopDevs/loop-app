import { rateLimitedMessage } from './payment-state.ts';
import { serviceState, serviceStateMessages } from './service-state.ts';

export class CtxError extends Error {
  static readonly serverFailedMessage = 'Something went wrong on our side. Try again in a moment.';
  static readonly requestFailedMessage = "That didn't go through. Try again.";
  static readonly knownMessages: Readonly<Record<string, string>> = {
    ErrInvalidCode: "That code didn't work. Check it and try again, or send a new one.",
  };

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
    const name = CtxError.field(body, 'error');
    const state = serviceState(name);
    if (state) {
      return serviceStateMessages[state];
    }
    if (name && Object.hasOwn(CtxError.knownMessages, name)) {
      return CtxError.knownMessages[name];
    }
    return status >= 500 ? CtxError.serverFailedMessage : CtxError.requestFailedMessage;
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
