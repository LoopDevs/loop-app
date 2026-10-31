import { existsSync, readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const sourceRoot = new URL('src/', root).href;
const sourceSuffixes = ['.ts', '.tsx', '/index.ts', '/index.tsx'];
const stubScheme = 'loop-native-stub:';

const memoryStorage = `
const items = new Map();
export const storage = {
  getItem: async (key) => items.get(key) ?? null,
  setItem: async (key, value) => void items.set(key, String(value)),
  removeItem: async (key) => void items.delete(key),
  clear: async () => items.clear(),
};
`;

const nativeStubs = {
  '@react-native-async-storage/async-storage': `${memoryStorage}export default storage;`,
  'expo-secure-store': `${memoryStorage}
export const getItemAsync = storage.getItem;
export const setItemAsync = storage.setItem;
export const deleteItemAsync = storage.removeItem;
export const canUseBiometricAuthentication = () => true;
export const AFTER_FIRST_UNLOCK = 'afterFirstUnlock';
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 'whenUnlockedThisDeviceOnly';`,
  '@sentry/react-native': `
export const init = () => undefined;
export const captureMessage = () => undefined;
export const breadcrumbsIntegration = () => ({});`,
  'expo-constants': `export default { expoConfig: { extra: {} } };`,
  'expo-updates': `
export const isEnabled = false;
export const isEmbeddedLaunch = true;
export const updateId = null;
export const checkForUpdateAsync = async () => ({ isAvailable: false, isRollBackToEmbedded: false });
export const fetchUpdateAsync = async () => ({});
export const reloadAsync = async () => undefined;`,
  'react-native': `export const Platform = { OS: 'ios' };`,
  'expo-local-authentication': `
export const hasHardwareAsync = async () => false;
export const isEnrolledAsync = async () => false;
export const authenticateAsync = async () => ({ success: true });`,
  'react-native-passkeys': `
export const isSupported = () => false;
export const create = async () => null;
export const get = async () => null;`,
};

globalThis.__DEV__ = false;

function sourceFile(base) {
  for (const suffix of ['', ...sourceSuffixes]) {
    const candidate = new URL(`${base.href}${suffix}`);
    if (suffix !== '' && existsSync(fileURLToPath(candidate))) {
      return candidate.href;
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(nativeStubs, specifier)) {
      return { url: `${stubScheme}${specifier}`, shortCircuit: true };
    }
    if (specifier.startsWith('@/')) {
      const found = sourceFile(new URL(`src/${specifier.slice(2)}`, root));
      if (found) {
        return { url: found, shortCircuit: true };
      }
    }
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      const relative = specifier.startsWith('./') || specifier.startsWith('../');
      const found = relative && context.parentURL ? sourceFile(new URL(specifier, context.parentURL)) : null;
      if (found) {
        return { url: found, shortCircuit: true };
      }
      throw error;
    }
  },
  load(url, context, nextLoad) {
    if (url.startsWith(stubScheme)) {
      return { format: 'module', source: nativeStubs[url.slice(stubScheme.length)], shortCircuit: true };
    }
    if (!url.startsWith(sourceRoot) || !url.endsWith('.ts')) {
      return nextLoad(url, context);
    }
    return {
      format: 'module',
      source: stripTypeScriptTypes(readFileSync(fileURLToPath(url), 'utf8'), { mode: 'transform' }),
      shortCircuit: true,
    };
  },
});
