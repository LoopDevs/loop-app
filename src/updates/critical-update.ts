export function criticalIndexOf(extra: unknown): number {
  const value = (extra as { criticalIndex?: unknown } | null | undefined)?.criticalIndex;
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;
}

export function criticalIndexFromEnv(value: string | undefined): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  if (!/^\d+$/.test(value)) {
    throw new Error(`LOOP_CRITICAL_INDEX must be a whole number, got "${value}"`);
  }
  return Number(value);
}

export function fetchedCriticalIndex(manifest: unknown): number {
  const extra = (manifest as { extra?: { expoClient?: { extra?: unknown } } } | null | undefined)?.extra;
  return criticalIndexOf(extra?.expoClient?.extra);
}

export function isCriticalUpdate(manifest: unknown, runningExtra: unknown): boolean {
  return fetchedCriticalIndex(manifest) > criticalIndexOf(runningExtra);
}

export type FetchedUpdate = {
  isNew: boolean;
  isRollBackToEmbedded: boolean;
  manifest?: unknown;
};

export function reloadsNow(fetched: FetchedUpdate, runningExtra: unknown): boolean {
  return fetched.isRollBackToEmbedded || (fetched.isNew && isCriticalUpdate(fetched.manifest, runningExtra));
}

export class UpdateInProgress extends Error {
  constructor() {
    super('Loop is updating. Try again in a moment.');
    this.name = 'UpdateInProgress';
  }
}

export class ReloadGate {
  private running = 0;
  private pending: (() => void | Promise<void>) | null = null;
  private reloading = false;

  async hold<T>(task: () => Promise<T>): Promise<T> {
    if (this.reloading) {
      throw new UpdateInProgress();
    }
    this.running += 1;
    try {
      return await task();
    } finally {
      this.running -= 1;
      this.flush();
    }
  }

  request(reload: () => void | Promise<void>): void {
    this.pending = reload;
    this.flush();
  }

  private flush(): void {
    if (this.running > 0 || !this.pending) {
      return;
    }
    const reload = this.pending;
    this.pending = null;
    this.reloading = true;
    new Promise<void>((resolve) => resolve(reload())).catch(() => {
      this.reloading = false;
    });
  }
}

type LaunchRecoveryOptions = {
  launchedAt: number;
  now: () => number;
  runsUpdate: () => boolean;
  fatal: (error: Error) => void;
};

export class LaunchRecovery {
  static readonly windowMs = 10_000;

  private readonly options: LaunchRecoveryOptions;

  constructor(options: LaunchRecoveryOptions) {
    this.options = options;
  }

  markFailed(error: unknown): boolean {
    const { launchedAt, now, runsUpdate, fatal } = this.options;
    if (!runsUpdate() || now() - launchedAt >= LaunchRecovery.windowMs) {
      return false;
    }
    fatal(error instanceof Error ? error : new Error(String(error)));
    return true;
  }
}
