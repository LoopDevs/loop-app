export const purchaseStages = ['ordered', 'atBank', 'backFromBank', 'approved', 'charged', 'delivered'] as const;

export type PurchaseStage = (typeof purchaseStages)[number];

export type PurchaseTimingReport = Record<string, string>;

export class PurchaseTiming {
  static readonly reportName = 'Bank purchase timing';
  private static current: PurchaseTiming | null = null;

  private orderId: string | null = null;
  private readonly marks = new Map<PurchaseStage, number>();

  private constructor(private readonly startedAt: number) {}

  static start(now = Date.now()): void {
    PurchaseTiming.current = new PurchaseTiming(now);
  }

  static drop(): void {
    PurchaseTiming.current = null;
  }

  static ordered(orderId: string, now = Date.now()): void {
    const timing = PurchaseTiming.current;
    if (timing && timing.orderId === null) {
      timing.orderId = orderId;
      timing.marks.set('ordered', now);
    }
  }

  static mark(stage: PurchaseStage, orderId: string, now = Date.now()): void {
    const timing = PurchaseTiming.current;
    if (timing && timing.orderId === orderId && !timing.marks.has(stage)) {
      timing.marks.set(stage, now);
    }
  }

  static finish(orderId: string, now = Date.now()): PurchaseTimingReport | null {
    const timing = PurchaseTiming.current;
    if (!timing || timing.orderId !== orderId) {
      return null;
    }
    timing.marks.set('delivered', timing.marks.get('delivered') ?? now);
    PurchaseTiming.current = null;
    return timing.report();
  }

  private report(): PurchaseTimingReport {
    const report: PurchaseTimingReport = {};
    let previous = this.startedAt;
    for (const stage of purchaseStages) {
      const at = this.marks.get(stage);
      if (at === undefined) {
        continue;
      }
      report[`purchase.${stage}_ms`] = String(at - previous);
      previous = at;
    }
    report['purchase.total_ms'] = String(previous - this.startedAt);
    return report;
  }
}
