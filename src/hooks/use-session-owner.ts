import { useCallback, useRef } from 'react';

import { ctx } from '@/ctx/client';
import { SessionOwner } from '@/session/session-owner';

export type SessionRead = { userId: string | null; changed: boolean };

export function useSessionOwner(): () => Promise<SessionRead> {
  const owner = useRef(new SessionOwner());
  return useCallback(async () => {
    const userId = (await ctx.isSignedIn()) ? await ctx.userId() : null;
    return { userId, changed: owner.current.changed(userId) };
  }, []);
}
