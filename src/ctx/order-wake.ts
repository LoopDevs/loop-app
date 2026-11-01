import { maxPollIntervalMs, pollIntervalMs } from "@/ctx/gift-card-status";
import { SocketEvent } from "@/ctx/socket-event";

export class OrderWake {
  private release: (() => void) | null = null;
  private signalled = false;
  private attached = false;

  static concerns(raw: unknown, orderId: string): boolean {
    const event = SocketEvent.parse(raw);
    if (!event || event.topic !== "giftcard") {
      return false;
    }
    const data = event.data as { id?: unknown } | null | undefined;
    return data?.id === orderId;
  }

  attach(): void {
    this.attached = true;
  }

  detach(): void {
    this.attached = false;
    this.signal();
  }

  interval(): number {
    return this.attached ? maxPollIntervalMs : pollIntervalMs;
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
