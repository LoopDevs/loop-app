export const lockAfterBackgroundMs = 5 * 60 * 1000;

export type AppLockStatus = 'loading' | 'off' | 'locked' | 'unlocked';

export type AuthenticationResult = { success: true } | { success: false; error: string };

const deviceWithoutScreenLockErrors: readonly string[] = ['not_enrolled', 'passcode_not_set'];

const cancelErrors: readonly string[] = ['user_cancel', 'system_cancel', 'app_cancel'];

export class AppLock {
  readonly status: AppLockStatus;
  readonly backgroundedAt: number | null;

  constructor(status: AppLockStatus, backgroundedAt: number | null = null) {
    this.status = status;
    this.backgroundedAt = backgroundedAt;
  }

  static loading(): AppLock {
    return new AppLock('loading');
  }

  static unlocksWith(result: AuthenticationResult): boolean {
    return result.success || deviceWithoutScreenLockErrors.includes(result.error);
  }

  static isCancel(result: AuthenticationResult): boolean {
    return !result.success && cancelErrors.includes(result.error);
  }

  loaded(enabled: boolean): AppLock {
    if (this.status !== 'loading') {
      return this;
    }
    return new AppLock(enabled ? 'locked' : 'off');
  }

  loadFailed(): AppLock {
    return this.loaded(true);
  }

  backgrounded(now: number): AppLock {
    if (this.status !== 'unlocked' || this.backgroundedAt !== null) {
      return this;
    }
    return new AppLock('unlocked', now);
  }

  foregrounded(now: number): AppLock {
    if (this.status !== 'unlocked' || this.backgroundedAt === null) {
      return this;
    }
    const elapsed = now - this.backgroundedAt;
    const expired = elapsed < 0 || elapsed >= lockAfterBackgroundMs;
    return new AppLock(expired ? 'locked' : 'unlocked');
  }

  unlocked(): AppLock {
    return this.status === 'locked' ? new AppLock('unlocked') : this;
  }

  turnedOn(): AppLock {
    return new AppLock('unlocked');
  }

  turnedOff(): AppLock {
    return new AppLock('off');
  }

  isOn(): boolean {
    return this.status === 'locked' || this.status === 'unlocked';
  }

  closesBrowser(): boolean {
    return this.status === 'locked';
  }

  covers(): boolean {
    return this.status === 'loading' || this.status === 'locked' || this.backgroundedAt !== null;
  }
}
