const staleBuildReloadKey = 'loop.staleBuildReloadAt';
const staleBuildReloadCooldownMs = 30_000;

export class StaleBuild {
  static caused(error: unknown): boolean {
    return error instanceof Error && error.name === 'AsyncRequireError';
  }

  static reloadAllowed(lastReloadAt: number | null, now: number): boolean {
    return lastReloadAt === null || now - lastReloadAt > staleBuildReloadCooldownMs;
  }

  static reloadOnce(): void {
    const now = Date.now();
    try {
      const stored = window.sessionStorage.getItem(staleBuildReloadKey);
      if (!StaleBuild.reloadAllowed(stored === null ? null : Number(stored), now)) {
        return;
      }
      window.sessionStorage.setItem(staleBuildReloadKey, String(now));
    } catch {
      return;
    }
    window.location.reload();
  }
}
