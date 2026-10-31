export class SocketEvent {
  private constructor(
    readonly topic: string,
    readonly data: unknown,
  ) {}

  static parse(raw: unknown): SocketEvent | null {
    if (typeof raw !== "string") {
      return null;
    }
    try {
      const message: unknown = JSON.parse(raw);
      if (!message || typeof message !== "object") {
        return null;
      }
      const { type, topic, data } = message as {
        type?: unknown;
        topic?: unknown;
        data?: unknown;
      };
      if (type !== "event" || typeof topic !== "string") {
        return null;
      }
      return new SocketEvent(topic, data);
    } catch {
      return null;
    }
  }
}
