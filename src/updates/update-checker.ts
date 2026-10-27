import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

import { errorReporting } from '@/ops/error-reporting';

import { isCriticalUpdate, ReloadGate } from './critical-update';

const gate = new ReloadGate();
let checking = false;

export function holdCriticalReload<T>(task: () => Promise<T>): Promise<T> {
  return gate.hold(task);
}

export function runningUpdateId(): string | null {
  if (!Updates.isEnabled || Updates.isEmbeddedLaunch || !Updates.updateId) {
    return null;
  }
  return Updates.updateId.slice(0, 8);
}

export async function checkForUpdate(): Promise<void> {
  if (__DEV__ || !Updates.isEnabled || checking) {
    return;
  }
  checking = true;
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) {
      return;
    }
    const fetched = await Updates.fetchUpdateAsync();
    if (fetched.isNew && isCriticalUpdate(fetched.manifest, Constants.expoConfig?.extra)) {
      gate.request(() =>
        Updates.reloadAsync().catch((error: unknown) => {
          errorReporting.reportMessage(`Critical update reload failed: ${error instanceof Error ? error.message : String(error)}`);
          throw error;
        }),
      );
    }
  } catch (error) {
    console.warn('Update check failed', error);
  } finally {
    checking = false;
  }
}
