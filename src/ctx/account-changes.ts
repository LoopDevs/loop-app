type Listener = () => void;

export type AccountSource = {
  watchAccount(onChange: () => void): Promise<() => void>;
  onSessionEnd(listener: () => void): () => void;
};

export class AccountChanges {
  static readonly coalesceMs = 300;
  static readonly reopenMs = 30_000;

  private readonly listeners = new Set<Listener>();
  private socket: Promise<() => void> | null = null;
  private pending: ReturnType<typeof setTimeout> | null = null;
  private reopening: ReturnType<typeof setTimeout> | null = null;
  private leaveSession: () => void = () => undefined;

  constructor(private readonly source: AccountSource) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      this.leaveSession = this.source.onSessionEnd(() => this.reopenLater());
      this.open();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stop();
      }
    };
  }

  private open(): void {
    const socket = this.source.watchAccount(() => this.notifySoon());
    this.socket = socket;
    socket.catch(() => {
      if (this.socket === socket) {
        this.reopenLater();
      }
    });
  }

  private reopenLater(): void {
    this.closeSocket();
    this.reopening ??= setTimeout(() => {
      this.reopening = null;
      if (this.listeners.size > 0) {
        this.open();
      }
    }, AccountChanges.reopenMs);
  }

  private notifySoon(): void {
    this.pending ??= setTimeout(() => {
      this.pending = null;
      this.listeners.forEach((notify) => notify());
    }, AccountChanges.coalesceMs);
  }

  private closeSocket(): void {
    this.socket?.then((close) => close()).catch(() => undefined);
    this.socket = null;
  }

  private stop(): void {
    this.leaveSession();
    this.closeSocket();
    for (const timer of [this.pending, this.reopening]) {
      if (timer) {
        clearTimeout(timer);
      }
    }
    this.pending = null;
    this.reopening = null;
  }
}
