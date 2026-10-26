export class RequestTimeoutError extends Error {
  constructor() {
    super('The server took too long to answer. Check your connection and try again.');
    this.name = 'RequestTimeoutError';
  }
}

export class Deadline {
  static readonly requestMs = 30_000;
  static readonly refreshMs = 12_000;

  static async run<T>(ms: number, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new RequestTimeoutError());
      }, ms);
    });
    try {
      return await Promise.race([task(controller.signal), expired]);
    } finally {
      clearTimeout(timer);
    }
  }
}
