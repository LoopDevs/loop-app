export type StoredSession = {
  refreshToken: string;
  owner: string;
};

export class StoredSessionText {
  static write(session: StoredSession): string {
    return JSON.stringify({ refreshToken: session.refreshToken, owner: session.owner });
  }

  static read(text: string | null): StoredSession | null {
    if (text === null) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(text);
      const { refreshToken, owner } = (parsed ?? {}) as Partial<Record<keyof StoredSession, unknown>>;
      if (typeof refreshToken !== 'string' || !refreshToken || typeof owner !== 'string' || !owner) {
        return null;
      }
      return { refreshToken, owner };
    } catch {
      return null;
    }
  }
}
