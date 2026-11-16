import { StoredSessionText, type StoredSession } from '@/session/stored-session';
import { holdCriticalReload } from '@/updates/update-checker';

const sessionKey = 'ctx.refreshToken';
const refreshLockName = 'ctx.refreshToken';

export const tokenStore = {
  async readSession(): Promise<StoredSession | null> {
    return StoredSessionText.read(window.localStorage.getItem(sessionKey));
  },
  async writeSession(session: StoredSession): Promise<void> {
    window.localStorage.setItem(sessionKey, StoredSessionText.write(session));
  },
  async clear(): Promise<void> {
    window.localStorage.removeItem(sessionKey);
  },
  exclusive<T>(task: () => Promise<T>): Promise<T> {
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
    const held = () => holdCriticalReload(task);
    return locks ? locks.request(refreshLockName, held) : held();
  },
};
