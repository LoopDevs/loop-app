import { StageTimer, type TimingReport } from './stage-timer.ts';

export const purchaseStages = ['ordered', 'atBank', 'backFromBank', 'approved', 'charged', 'delivered'] as const;

export type PurchaseStage = (typeof purchaseStages)[number];

export class PurchaseTiming {
  static readonly reportName = 'Bank purchase timing';
  private static current: PurchaseTiming | null = null;

  private orderId: string | null = null;
  private readonly timer: StageTimer<PurchaseStage>;

  private constructor(startedAt: number) {
    this.timer = new StageTimer('purchase', purchaseStages, startedAt);
  }

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
      timing.timer.mark('ordered', now);
    }
  }

  static mark(stage: PurchaseStage, orderId: string, now = Date.now()): void {
    const timing = PurchaseTiming.current;
    if (timing && timing.orderId === orderId) {
      timing.timer.mark(stage, now);
    }
  }

  static finish(orderId: string, now = Date.now()): TimingReport | null {
    const timing = PurchaseTiming.current;
    if (!timing || timing.orderId !== orderId) {
      return null;
    }
    timing.timer.mark('delivered', now);
    PurchaseTiming.current = null;
    return timing.timer.report();
  }
}
