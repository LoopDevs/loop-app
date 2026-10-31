export type BuyStep =
  | 'order created'
  | 'payment built'
  | 'ledger read'
  | 'signed'
  | 'submitted'
  | 'paid seen'
  | 'card shown';

export class BuyTimer {
  private readonly startedAt: number;
  private readonly now: () => number;
  private readonly sink: (line: string) => void;

  constructor(now: () => number, sink: (line: string) => void) {
    this.now = now;
    this.sink = sink;
    this.startedAt = now();
  }

  static dev(): BuyTimer {
    return new BuyTimer(Date.now, (line) => {
      if (__DEV__) {
        console.log(line);
      }
    });
  }

  mark(step: BuyStep): void {
    this.sink(`[buy] ${step} +${this.now() - this.startedAt}ms`);
  }
}
