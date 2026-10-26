export class ForegroundRefresh {
  static readonly minimumIntervalMs = 15_000;

  private wasBackgrounded = false;
  private lastEmittedAt: number | null = null;

  shouldRefresh(next: string, now: number): boolean {
    if (next === 'background') {
      this.wasBackgrounded = true;
      return false;
    }
    if (next !== 'active' || !this.wasBackgrounded) {
      return false;
    }
    this.wasBackgrounded = false;
    if (this.lastEmittedAt !== null && now - this.lastEmittedAt < ForegroundRefresh.minimumIntervalMs) {
      return false;
    }
    this.lastEmittedAt = now;
    return true;
  }
}
