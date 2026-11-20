import { StageTimer, type TimingReport } from './stage-timer.ts';

export const redeemStages = ['loaded', 'read', 'saved', 'closed'] as const;

export type RedeemStage = (typeof redeemStages)[number];

export class RedeemTiming {
  static readonly reportName = 'Redeem page timing';

  private readonly timer: StageTimer<RedeemStage>;
  private readonly host: string;
  private outcome: 'saved' | 'closed' | null = null;

  constructor(
    url: string,
    private readonly merchantName: string,
    now = Date.now(),
  ) {
    this.timer = new StageTimer('redeem', redeemStages, now);
    this.host = RedeemTiming.hostOf(url);
  }

  private static hostOf(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return 'unknown';
    }
  }

  mark(stage: 'loaded' | 'read', now = Date.now()): void {
    this.timer.mark(stage, now);
  }

  finish(outcome: 'saved' | 'closed', now = Date.now()): TimingReport | null {
    if (this.outcome !== null) {
      return null;
    }
    this.outcome = outcome;
    this.timer.mark(outcome, now);
    return {
      ...this.timer.report(),
      'redeem.outcome': outcome,
      'redeem.host': this.host,
      'redeem.merchant': this.merchantName,
    };
  }
}
