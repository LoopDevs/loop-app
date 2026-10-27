import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

import { loopEnvironment } from '@/environment';
import { errorReporting } from '@/ops/error-reporting';

import { LaunchRecovery, ReloadGate, reloadsNow } from './critical-update';

const gate = new ReloadGate();
const launchRecovery = new LaunchRecovery({
  launchedAt: Date.now(),
  now: Date.now,
  runsUpdate: () => runningUpdateId() !== null,
  fatal: (error) => ErrorUtils.getGlobalHandler()(error, true),
});
let checking = false;
let reportedDisabled = false;

export function holdCriticalReload<T>(task: () => Promise<T>): Promise<T> {
  return gate.hold(task);
}

export function runningUpdateId(): string | null {
  if (!Updates.isEnabled || Updates.isEmbeddedLaunch || !Updates.updateId) {
    return null;
  }
  return Updates.updateId.slice(0, 8);
}

export function markLaunchFailed(error: unknown): boolean {
  return launchRecovery.markFailed(error);
}

export async function checkForUpdate(): Promise<void> {
  if (__DEV__ || checking) {
    return;
  }
  if (!Updates.isEnabled) {
    if (!reportedDisabled && loopEnvironment.name === 'production') {
      reportedDisabled = true;
      errorReporting.reportMessage('Updates are disabled in this build');
    }
    return;
  }
  checking = true;
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable && !check.isRollBackToEmbedded) {
      return;
    }
    const fetched = await Updates.fetchUpdateAsync();
    if (reloadsNow(fetched, Constants.expoConfig?.extra)) {
      gate.request(() =>
        Updates.reloadAsync().catch((error: unknown) => {
          errorReporting.reportMessage(`Critical update reload failed: ${error instanceof Error ? error.message : String(error)}`);
          throw error;
        }),
      );
    }
  } catch (error) {
    console.warn('Update check failed', error);
    errorReporting.reportErrorOnce(error, 'Update check');
  } finally {
    checking = false;
  }
}
