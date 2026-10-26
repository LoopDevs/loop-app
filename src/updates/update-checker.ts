import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

import { isCriticalUpdate, ReloadGate } from './critical-update';

const gate = new ReloadGate();
let checking = false;

export function holdCriticalReload<T>(task: () => Promise<T>): Promise<T> {
  return gate.hold(task);
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
      gate.request(() => {
        void Updates.reloadAsync();
      });
    }
  } catch (error) {
    console.warn('Update check failed', error);
  } finally {
    checking = false;
  }
}
