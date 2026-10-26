export class OrderWake {
  private release: (() => void) | null = null;
  private signalled = false;

  static concerns(raw: unknown, orderId: string): boolean {
    if (typeof raw !== "string") {
      return false;
    }
    try {
      const message: unknown = JSON.parse(raw);
      if (!message || typeof message !== "object") {
        return false;
      }
      const { type, topic, data } = message as {
        type?: unknown;
        topic?: unknown;
        data?: { id?: unknown } | null;
      };
      return type === "event" && topic === "giftcard" && data?.id === orderId;
    } catch {
      return false;
    }
  }

  signal(): void {
    if (this.release) {
      this.release();
      return;
    }
    this.signalled = true;
  }

  wait(ms: number): Promise<void> {
    if (this.signalled) {
      this.signalled = false;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.release?.(), ms);
      this.release = () => {
        clearTimeout(timer);
        this.release = null;
        resolve();
      };
    });
  }
}
