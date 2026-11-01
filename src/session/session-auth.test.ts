import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CtxError } from '../ctx/ctx-error.ts';
import { SessionAuth, type RefreshTokenStore, type Send, type SendOptions } from './session-auth.ts';

type Call = {
  path: string;
  token: string | undefined;
  idempotencyKey?: string;
};

type Route = (call: Call) => Promise<unknown>;

class FakeCtx {
  readonly calls: Call[] = [];
  readonly route: Route;

  constructor(route: Route) {
    this.route = route;
  }

  send: Send = <T>(_method: string, path: string, _body?: unknown, options?: SendOptions): Promise<T> => {
    const call = {
      path,
      token: options?.headers?.Authorization?.replace('Bearer ', ''),
      idempotencyKey: options?.headers?.['Idempotency-Key'],
    };
    this.calls.push(call);
    return this.route(call) as Promise<T>;
  };

  refreshes(): number {
    return this.calls.filter((call) => call.path === '/refresh-token').length;
  }

  tokensFor(path: string): (string | undefined)[] {
    return this.calls.filter((call) => call.path === path).map((call) => call.token);
  }
}

class MemoryStore implements RefreshTokenStore {
  refreshToken: string | null;
  pendingWrite: Promise<void> = Promise.resolve();

  constructor(refreshToken: string | null) {
    this.refreshToken = refreshToken;
  }

  async readRefreshToken(): Promise<string | null> {
    return this.refreshToken;
  }

  async writeRefreshToken(token: string): Promise<void> {
    await this.pendingWrite;
    this.refreshToken = token;
  }

  async clear(): Promise<void> {
    this.refreshToken = null;
  }

  exclusive<T>(task: () => Promise<T>): Promise<T> {
    return task();
  }
}

class Gate {
  readonly opened: Promise<void>;
  open: () => void = () => undefined;

  constructor() {
    this.opened = new Promise((resolve) => {
      this.open = resolve;
    });
  }
}

const unauthorized = () => new CtxError(401, '{"error":"ErrTokenInvalid"}');

const ownerOf = (accessToken: string) => accessToken.charAt(0);

test('a call made during sign-in waits for and uses the new tokens', async () => {
  const ctx = new FakeCtx(async () => ({ ok: true }));
  const store = new MemoryStore('r-old');
  const write = new Gate();
  store.pendingWrite = write.opened;
  const auth = new SessionAuth(ctx.send, store, ownerOf);

  const signingIn = auth.startSession({ accessToken: 'a-new', refreshToken: 'r-new' });
  const request = auth.sessionRequest('GET', '/me');
  write.open();
  await Promise.all([signingIn, request]);

  assert.deepEqual(ctx.tokensFor('/me'), ['a-new']);
  assert.equal(ctx.refreshes(), 0);
  assert.equal(store.refreshToken, 'r-new');
});

test('a request retried after a refresh keeps its idempotency key', async () => {
  const ctx = new FakeCtx(async ({ path, token }) => {
    if (path === '/refresh-token') {
      return { accessToken: 'a2', refreshToken: 'r2' };
    }
    if (token === 'a2') {
      return { ok: true };
    }
    throw unauthorized();
  });
  const auth = new SessionAuth(ctx.send, new MemoryStore(null), ownerOf);
  await auth.startSession({ accessToken: 'a1', refreshToken: 'r1' });

  await auth.sessionRequest('POST', '/gift-cards', {}, true, { 'Idempotency-Key': 'order-1' });

  assert.deepEqual(
    ctx.calls.filter((call) => call.path === '/gift-cards').map((call) => [call.token, call.idempotencyKey]),
    [
      ['a1', 'order-1'],
      ['a2', 'order-1'],
    ],
  );
});

test('a late 401 after a refresh retries with the new token without rotating again', async () => {
  const late = new Gate();
  const ctx = new FakeCtx(async ({ path, token }) => {
    if (path === '/refresh-token') {
      return { accessToken: 'a2', refreshToken: 'r2' };
    }
    if (token === 'a2') {
      return { ok: true };
    }
    if (path === '/slow') {
      await late.opened;
    }
    throw unauthorized();
  });
  const auth = new SessionAuth(ctx.send, new MemoryStore(null), ownerOf);
  await auth.startSession({ accessToken: 'a1', refreshToken: 'r1' });

  const slow = auth.sessionRequest('GET', '/slow');
  await auth.sessionRequest('GET', '/fast');
  late.open();
  await slow;

  assert.equal(ctx.refreshes(), 1);
  assert.deepEqual(ctx.tokensFor('/slow'), ['a1', 'a2']);
  assert.deepEqual(ctx.tokensFor('/fast'), ['a1', 'a2']);
});

test('a refresh retries once after a network error', async () => {
  let attempts = 0;
  const ctx = new FakeCtx(async ({ path }) => {
    if (path === '/refresh-token') {
      attempts += 1;
      if (attempts === 1) {
        throw new TypeError('Network request failed');
      }
      return { accessToken: 'a2', refreshToken: 'r2' };
    }
    return { ok: true };
  });
  const auth = new SessionAuth(ctx.send, new MemoryStore('r1'), ownerOf);

  await auth.sessionRequest('GET', '/me');

  assert.equal(ctx.refreshes(), 2);
  assert.deepEqual(ctx.tokensFor('/me'), ['a2']);
});

test('a refresh refused by CTX is not retried', async () => {
  const refused = new CtxError(500, '{"error":"internal"}');
  const ctx = new FakeCtx(async ({ path }) => {
    if (path === '/refresh-token') {
      throw refused;
    }
    return { ok: true };
  });
  const store = new MemoryStore('r1');
  const auth = new SessionAuth(ctx.send, store, ownerOf);

  await assert.rejects(auth.sessionRequest('GET', '/me'), refused);

  assert.equal(ctx.refreshes(), 1);
  assert.equal(store.refreshToken, 'r1');
});

test('concurrent refreshes share one rotation', async () => {
  const ctx = new FakeCtx(async ({ path }) =>
    path === '/refresh-token' ? { accessToken: 'a2', refreshToken: 'r2' } : { ok: true },
  );
  const auth = new SessionAuth(ctx.send, new MemoryStore('r1'), ownerOf);

  await Promise.all([auth.sessionRequest('GET', '/one'), auth.sessionRequest('GET', '/two')]);

  assert.equal(ctx.refreshes(), 1);
  assert.deepEqual(ctx.tokensFor('/one'), ['a2']);
  assert.deepEqual(ctx.tokensFor('/two'), ['a2']);
});

test('a refresh token CTX rejects is cleared and the session ends', async () => {
  const ctx = new FakeCtx(async () => {
    throw unauthorized();
  });
  const store = new MemoryStore('r1');
  const auth = new SessionAuth(ctx.send, store, ownerOf);

  await assert.rejects(auth.sessionRequest('GET', '/me'), /Sign in first/);

  assert.equal(ctx.refreshes(), 1);
  assert.equal(store.refreshToken, null);
  assert.equal(await auth.hasSession(), false);
});

test('listeners hear the session end on sign-out and on a rejected refresh token, until they unsubscribe', async () => {
  const ctx = new FakeCtx(async () => {
    throw unauthorized();
  });
  const auth = new SessionAuth(ctx.send, new MemoryStore('r1'), ownerOf);
  let ended = 0;
  const stop = auth.onSessionEnd(() => {
    ended += 1;
  });

  await assert.rejects(auth.sessionRequest('GET', '/me'), /Sign in first/);
  assert.equal(ended, 1);
  await auth.clearSession();
  assert.equal(ended, 2);
  stop();
  await auth.clearSession();
  assert.equal(ended, 2);
});

test('a 401 that denies the call rather than the token is thrown without a rotation', async () => {
  const denied = new CtxError(401, '{"error":"ErrNotAuthorized"}');
  const ctx = new FakeCtx(async ({ path }) => {
    if (path === '/refresh-token') {
      return { accessToken: 'a2', refreshToken: 'r2' };
    }
    throw denied;
  });
  const auth = new SessionAuth(ctx.send, new MemoryStore(null), ownerOf);
  await auth.startSession({ accessToken: 'a1', refreshToken: 'r1' });

  await assert.rejects(auth.sessionRequest('GET', '/me'), denied);

  assert.equal(ctx.refreshes(), 0);
  assert.deepEqual(ctx.tokensFor('/me'), ['a1']);
});

test("a refresh that yields another user's tokens ends this session and keeps the store for that user", async () => {
  const ctx = new FakeCtx(async ({ path, token }) => {
    if (path === '/refresh-token') {
      return { accessToken: 'b2', refreshToken: 'b-r2' };
    }
    if (token === 'a1') {
      throw unauthorized();
    }
    return { ok: true };
  });
  const store = new MemoryStore(null);
  const auth = new SessionAuth(ctx.send, store, ownerOf);
  let ended = 0;
  auth.onSessionEnd(() => {
    ended += 1;
  });
  await auth.startSession({ accessToken: 'a1', refreshToken: 'a-r1' });
  store.refreshToken = 'b-r1';

  await assert.rejects(auth.sessionRequest('GET', '/me'), (error) => error instanceof CtxError && error.status === 401);

  assert.equal(ended, 1);
  assert.equal(store.refreshToken, 'b-r2');
  assert.deepEqual(ctx.tokensFor('/me'), ['a1']);

  await auth.sessionRequest('GET', '/me');

  assert.equal(ctx.refreshes(), 2);
  assert.deepEqual(ctx.tokensFor('/me'), ['a1', 'b2']);
  assert.equal(ended, 1);
});

test('a replacement for the current token rotates once and a stale token reuses the replacement', async () => {
  const ctx = new FakeCtx(async ({ path }) =>
    path === '/refresh-token' ? { accessToken: 'a2', refreshToken: 'r2' } : { ok: true },
  );
  const auth = new SessionAuth(ctx.send, new MemoryStore(null), ownerOf);
  await auth.startSession({ accessToken: 'a1', refreshToken: 'r1' });

  assert.equal(await auth.replacement('a1'), 'a2');
  assert.equal(await auth.replacement('a1'), 'a2');

  assert.equal(ctx.refreshes(), 1);
});

test('a second 401 after the retry is thrown without another rotation', async () => {
  const ctx = new FakeCtx(async ({ path }) => {
    if (path === '/refresh-token') {
      return { accessToken: 'a2', refreshToken: 'r2' };
    }
    throw unauthorized();
  });
  const auth = new SessionAuth(ctx.send, new MemoryStore(null), ownerOf);
  await auth.startSession({ accessToken: 'a1', refreshToken: 'r1' });

  await assert.rejects(auth.sessionRequest('GET', '/me'), (error) => error instanceof CtxError && error.status === 401);

  assert.equal(ctx.refreshes(), 1);
  assert.deepEqual(ctx.tokensFor('/me'), ['a1', 'a2']);
});

test('signing out during a refresh keeps the session ended', async () => {
  const rotation = new Gate();
  const ctx = new FakeCtx(async ({ path }) => {
    if (path === '/refresh-token') {
      await rotation.opened;
      return { accessToken: 'a2', refreshToken: 'r2' };
    }
    return { ok: true };
  });
  const store = new MemoryStore('r1');
  const auth = new SessionAuth(ctx.send, store, ownerOf);

  const request = auth.sessionRequest('GET', '/me');
  await new Promise((resolve) => setImmediate(resolve));
  await auth.clearSession();
  rotation.open();

  await assert.rejects(request, /Sign in first/);
  assert.equal(store.refreshToken, null);
  assert.equal(await auth.hasSession(), false);
  assert.deepEqual(ctx.tokensFor('/me'), []);
});

test('a rotation runs inside the store lock', async () => {
  let locked = false;
  const rotatedWhileLocked: boolean[] = [];
  const ctx = new FakeCtx(async ({ path }) => {
    if (path === '/refresh-token') {
      rotatedWhileLocked.push(locked);
      return { accessToken: 'a2', refreshToken: 'r2' };
    }
    return { ok: true };
  });
  const store = new MemoryStore('r1');
  store.exclusive = async (task) => {
    locked = true;
    try {
      return await task();
    } finally {
      locked = false;
    }
  };
  const auth = new SessionAuth(ctx.send, store, ownerOf);

  await auth.sessionRequest('GET', '/me');

  assert.deepEqual(rotatedWhileLocked, [true]);
});

test('a 401 after another tab rotates the session retries with the token that tab stored', async () => {
  const store = new MemoryStore(null);
  const ctx = new FakeCtx(async ({ path, token }) => {
    if (path === '/refresh-token') {
      return store.refreshToken === 'r1'
        ? { accessToken: 'a2', refreshToken: 'r2' }
        : { accessToken: 'a4', refreshToken: 'r4' };
    }
    if (token === 'a2') {
      store.refreshToken = 'r3';
    }
    if (token === 'a4') {
      return { ok: true };
    }
    throw unauthorized();
  });
  const auth = new SessionAuth(ctx.send, store, ownerOf);
  await auth.startSession({ accessToken: 'a1', refreshToken: 'r1' });

  await auth.sessionRequest('GET', '/me');

  assert.equal(ctx.refreshes(), 2);
  assert.deepEqual(ctx.tokensFor('/me'), ['a1', 'a2', 'a4']);
  assert.equal(store.refreshToken, 'r4');
});
