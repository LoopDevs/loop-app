export type TimingReport = Record<string, string>;

export class StageTimer<Stage extends string> {
  private readonly marks = new Map<Stage, number>();

  constructor(
    private readonly prefix: string,
    private readonly stages: readonly Stage[],
    private readonly startedAt: number,
  ) {}

  mark(stage: Stage, now: number): void {
    if (!this.marks.has(stage)) {
      this.marks.set(stage, now);
    }
  }

  report(): TimingReport {
    const report: TimingReport = {};
    let previous = this.startedAt;
    for (const stage of this.stages) {
      const at = this.marks.get(stage);
      if (at === undefined) {
        continue;
      }
      report[`${this.prefix}.${stage}_ms`] = String(at - previous);
      previous = at;
    }
    report[`${this.prefix}.total_ms`] = String(previous - this.startedAt);
    return report;
  }
}
