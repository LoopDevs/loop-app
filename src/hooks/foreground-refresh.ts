export class ForegroundRefresh {
  static readonly minimumIntervalMs = 15_000;

  private wasBackgrounded = false;
  private lastEmittedAt: number | null = null;
  private lastReconnectAt: number | null = null;

  private static isTooSoon(last: number | null, now: number): boolean {
    return last !== null && now >= last && now - last < ForegroundRefresh.minimumIntervalMs;
  }

  shouldRefreshOnReconnect(now: number): boolean {
    if (ForegroundRefresh.isTooSoon(this.lastReconnectAt, now)) {
      return false;
    }
    this.lastReconnectAt = now;
    return true;
  }

  shouldRefresh(next: string, now: number): boolean {
    if (next === 'background') {
      this.wasBackgrounded = true;
      return false;
    }
    if (next !== 'active' || !this.wasBackgrounded) {
      return false;
    }
    this.wasBackgrounded = false;
    if (ForegroundRefresh.isTooSoon(this.lastEmittedAt, now)) {
      return false;
    }
    this.lastEmittedAt = now;
    return true;
  }
}
