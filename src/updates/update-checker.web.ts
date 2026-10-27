import Constants from 'expo-constants';

import { errorReporting } from '@/ops/error-reporting';

import { criticalIndexOf, ReloadGate } from './critical-update';

const versionUrl = '/app-version.json';
const reloadedForKey = 'updates.reloadedFor';
const gate = new ReloadGate();
let checking = false;

export function holdCriticalReload<T>(task: () => Promise<T>): Promise<T> {
  return gate.hold(task);
}

export function runningUpdateId(): string | null {
  return null;
}

export function markLaunchFailed(): void {}

function alreadyReloadedFor(criticalIndex: string): boolean {
  try {
    return window.sessionStorage.getItem(reloadedForKey) === criticalIndex;
  } catch {
    return true;
  }
}

function rememberReloadFor(criticalIndex: string): void {
  try {
    window.sessionStorage.setItem(reloadedForKey, criticalIndex);
  } catch (error) {
    console.warn('Saving the reload marker failed', error);
  }
}

export async function checkForUpdate(): Promise<void> {
  if (__DEV__ || checking) {
    return;
  }
  checking = true;
  try {
    const response = await fetch(versionUrl, { cache: 'no-store' });
    if (!response.ok) {
      return;
    }
    const deployed = String(criticalIndexOf(await response.json()));
    if (Number(deployed) > criticalIndexOf(Constants.expoConfig?.extra) && !alreadyReloadedFor(deployed)) {
      gate.request(() => {
        rememberReloadFor(deployed);
        window.location.reload();
      });
    }
  } catch (error) {
    console.warn('Update check failed', error);
    errorReporting.reportErrorOnce(error, 'Update check');
  } finally {
    checking = false;
  }
}
