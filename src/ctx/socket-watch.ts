export type WatchedSocket = {
  onopen: (() => void) | null;
  onmessage: ((message: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
};

export type SocketAuth = {
  requireAccessToken(): Promise<string>;
  replacement(rejected: string): Promise<string>;
  onSessionEnd(listener: () => void): () => void;
};

export type SocketPresence = {
  attach: () => void;
  detach: () => void;
};

export class SocketWatch {
  static readonly maxAttempts = 5;
  static readonly retryDelayMs = 1000;

  private attempts = 0;
  private closed = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private socket: WatchedSocket | null = null;
  private leaveSession: () => void = () => undefined;

  constructor(
    private readonly auth: SocketAuth,
    private readonly open: (accessToken: string) => WatchedSocket,
    private readonly topic: string,
    private readonly onMessage: (raw: unknown) => void,
    private readonly presence?: SocketPresence,
  ) {}

  async start(): Promise<() => void> {
    const accessToken = await this.auth.requireAccessToken();
    this.leaveSession = this.auth.onSessionEnd(() => this.close());
    this.connect(accessToken);
    return () => this.close();
  }

  close(): void {
    this.closed = true;
    this.leaveSession();
    if (this.retry !== null) {
      clearTimeout(this.retry);
      this.retry = null;
    }
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  private connect(accessToken: string): void {
    if (this.closed) {
      return;
    }
    const socket = this.open(accessToken);
    let opened = false;
    socket.onopen = () => {
      opened = true;
      this.attempts = 0;
      socket.send(JSON.stringify({ action: 'subscribe', topic: this.topic }));
      this.presence?.attach();
    };
    socket.onmessage = (message) => this.onMessage(message.data);
    socket.onerror = () => undefined;
    socket.onclose = () => {
      this.presence?.detach();
      if (this.socket === socket) {
        this.socket = null;
        this.reconnect(opened ? null : accessToken);
      }
    };
    this.socket = socket;
  }

  private reconnect(rejected: string | null): void {
    if (this.closed || this.attempts >= SocketWatch.maxAttempts) {
      return;
    }
    const delayMs = SocketWatch.retryDelayMs * 2 ** this.attempts;
    this.attempts += 1;
    this.retry = setTimeout(() => {
      this.retry = null;
      this.accessTokenAfter(rejected)
        .then((accessToken) => this.connect(accessToken))
        .catch(() => this.reconnect(null));
    }, delayMs);
  }

  private accessTokenAfter(rejected: string | null): Promise<string> {
    return rejected === null ? this.auth.requireAccessToken() : this.auth.replacement(rejected);
  }
}
