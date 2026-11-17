import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CtxError } from '../ctx/ctx-error.ts';
import {
  SessionAuth,
  type RefreshTokenStore,
  type Send,
  type SendOptions,
  type SessionEnd,
} from './session-auth.ts';
import type { StoredSession } from './stored-session.ts';

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
  owner: string;
  pendingWrite: Promise<void> = Promise.resolve();

  constructor(refreshToken: string | null, owner = 'a') {
    this.refreshToken = refreshToken;
    this.owner = owner;
  }

  signedInElsewhere(refreshToken: string, owner: string): void {
    this.refreshToken = refreshToken;
    this.owner = owner;
  }

  async readSession(): Promise<StoredSession | null> {
    return this.refreshToken === null ? null : { refreshToken: this.refreshToken, owner: this.owner };
  }

  async writeSession(session: StoredSession): Promise<void> {
    await this.pendingWrite;
    this.refreshToken = session.refreshToken;
    this.owner = session.owner;
  }

  pendingClear: Promise<void> = Promise.resolve();

  async clear(): Promise<void> {
    this.refreshToken = null;
    await this.pendingClear;
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

test('listeners hear which owner the ended session belonged to and why it ended', async () => {
  const ctx = new FakeCtx(async () => ({ ok: true }));
  const auth = new SessionAuth(ctx.send, new MemoryStore(null), ownerOf);
  const ended: SessionEnd[] = [];
  auth.onSessionEnd((end) => {
    ended.push(end);
  });
  await auth.startSession({ accessToken: 'a1', refreshToken: 'a-r1' });
  await auth.clearSession('signed-out');
  await auth.clearSession('signed-out');
  assert.deepEqual(ended, [
    { owner: null, reason: 'replaced', nextOwner: 'a' },
    { owner: 'a', reason: 'signed-out', nextOwner: null },
    { owner: null, reason: 'signed-out', nextOwner: null },
  ]);
});

test('a sign-in tells listeners who signs in next, unless the same owner is already signed in', async () => {
  const ctx = new FakeCtx(async () => ({ ok: true }));
  const auth = new SessionAuth(ctx.send, new MemoryStore(null), ownerOf);
  const ended: SessionEnd[] = [];
  await auth.startSession({ accessToken: 'a1', refreshToken: 'a-r1' });
  auth.onSessionEnd((end) => {
    ended.push(end);
  });
  await auth.startSession({ accessToken: 'a2', refreshToken: 'a-r2' });
  assert.deepEqual(ended, []);
  await auth.startSession({ accessToken: 'b1', refreshToken: 'b-r1' });
  assert.deepEqual(ended, [{ owner: 'a', reason: 'replaced', nextOwner: 'b' }]);
  assert.equal(await auth.accessToken(), 'b1');
});

test('a sign-in after an expired session still names who signs in next', async () => {
  const ctx = new FakeCtx(async () => {
    throw unauthorized();
  });
  const auth = new SessionAuth(ctx.send, new MemoryStore('a-r1'), ownerOf);
  const ended: SessionEnd[] = [];
  auth.onSessionEnd((end) => {
    ended.push(end);
  });
  assert.equal(await auth.accessToken(), null);
  await auth.startSession({ accessToken: 'b1', refreshToken: 'b-r1' });
  assert.deepEqual(ended, [
    { owner: null, reason: 'expired', nextOwner: null },
    { owner: null, reason: 'replaced', nextOwner: 'b' },
  ]);
});

test('a refresh token CTX rejects ends the session as expired', async () => {
  const ctx = new FakeCtx(async () => {
    throw unauthorized();
  });
  const auth = new SessionAuth(ctx.send, new MemoryStore('r1'), ownerOf);
  const ended: SessionEnd[] = [];
  auth.onSessionEnd((end) => {
    ended.push(end);
  });
  assert.equal(await auth.accessToken(), null);
  assert.deepEqual(ended, [{ owner: null, reason: 'expired', nextOwner: null }]);
});

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
  await auth.clearSession('signed-out');
  assert.equal(ended, 2);
  stop();
  await auth.clearSession('signed-out');
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

test("a refresh that finds another user's stored token ends this session, never sends that token and stays signed out", async () => {
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
  await auth.startSession({ accessToken: 'a1', refreshToken: 'a-r1' });
  let ended = 0;
  auth.onSessionEnd(() => {
    ended += 1;
  });
  store.signedInElsewhere('b-r1', 'b');

  await assert.rejects(auth.sessionRequest('GET', '/me'), (error) => error instanceof CtxError && error.status === 401);

  assert.equal(ended, 1);
  assert.equal(store.refreshToken, 'b-r1');
  assert.deepEqual(ctx.tokensFor('/me'), ['a1']);

  await assert.rejects(auth.sessionRequest('GET', '/me'), /Sign in first/);

  assert.equal(ctx.refreshes(), 0);
  assert.equal(await auth.hasSession(), false);
  assert.equal(store.refreshToken, 'b-r1');
  assert.equal(ended, 1);

  await auth.startSession({ accessToken: 'b3', refreshToken: 'b-r3' });
  await auth.sessionRequest('GET', '/me');

  assert.deepEqual(ctx.tokensFor('/me'), ['a1', 'b3']);
  assert.equal(await auth.hasSession(), true);
});

test('a sign-in after a refused refresh names who signs in next, even the owner it refused', async () => {
  const ctx = new FakeCtx(async ({ path, token }) => {
    if (path === '/refresh-token') {
      return { accessToken: 'b2', refreshToken: 'b-r2' };
    }
    if (token === 'a1') {
      throw unauthorized();
    }
    return { ok: true };
  });
  const auth = new SessionAuth(ctx.send, new MemoryStore(null), ownerOf);
  await auth.startSession({ accessToken: 'a1', refreshToken: 'a-r1' });
  const ended: SessionEnd[] = [];
  auth.onSessionEnd((end) => {
    ended.push(end);
  });

  await assert.rejects(auth.sessionRequest('GET', '/me'));
  await auth.startSession({ accessToken: 'a3', refreshToken: 'a-r3' });

  assert.deepEqual(ended, [
    { owner: 'a', reason: 'refused', nextOwner: null },
    { owner: 'a', reason: 'replaced', nextOwner: 'a' },
  ]);
});

test("after a refused refresh, another tab's sign-in ends this session as replaced and is never adopted", async () => {
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
  await auth.startSession({ accessToken: 'a1', refreshToken: 'a-r1' });
  const ended: SessionEnd[] = [];
  auth.onSessionEnd((end) => {
    ended.push(end);
  });

  await assert.rejects(auth.sessionRequest('GET', '/me'));
  store.signedInElsewhere('b-r3', 'b');
  await assert.rejects(auth.sessionRequest('GET', '/me'));

  assert.equal(await auth.hasSession(), false);
  assert.deepEqual(ended, [
    { owner: 'a', reason: 'refused', nextOwner: null },
    { owner: 'a', reason: 'replaced', nextOwner: 'b' },
  ]);
  assert.deepEqual(ctx.tokensFor('/me'), ['a1']);
});

test("once the owner's own session is adopted after a refusal, that owner signing in again ends nothing", async () => {
  let refreshes = 0;
  const ctx = new FakeCtx(async ({ path, token }) => {
    if (path === '/refresh-token') {
      refreshes += 1;
      return refreshes === 1 ? { accessToken: 'b2', refreshToken: 'b-r2' } : { accessToken: 'a4', refreshToken: 'a-r4' };
    }
    if (token === 'a1') {
      throw unauthorized();
    }
    return { ok: true };
  });
  const store = new MemoryStore(null);
  const auth = new SessionAuth(ctx.send, store, ownerOf);
  await auth.startSession({ accessToken: 'a1', refreshToken: 'a-r1' });
  const ended: SessionEnd[] = [];
  auth.onSessionEnd((end) => {
    ended.push(end);
  });

  await assert.rejects(auth.sessionRequest('GET', '/me'));
  store.refreshToken = 'a-r3';
  await auth.sessionRequest('GET', '/me');
  await auth.startSession({ accessToken: 'a5', refreshToken: 'a-r5' });

  assert.deepEqual(
    ended.map((end) => end.reason),
    ['refused'],
  );
});

test("a refresh of this user's token that CTX answers with another user is refused and the other user's token is never kept", async () => {
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
  await auth.startSession({ accessToken: 'a1', refreshToken: 'a-r1' });
  store.signedInElsewhere('a-r2', 'a');
  const ended: SessionEnd[] = [];
  auth.onSessionEnd((end) => {
    ended.push(end);
  });

  await assert.rejects(auth.sessionRequest('GET', '/me'));

  assert.deepEqual(ended, [{ owner: 'a', reason: 'refused', nextOwner: null }]);
  assert.equal(store.refreshToken, null);
  const reloaded = new SessionAuth(ctx.send, store, ownerOf);
  assert.equal(await reloaded.hasSession(), false);
  assert.equal(await reloaded.accessToken(), null);
  assert.deepEqual(ctx.tokensFor('/me'), ['a1']);
});

test('a sign-in that lands while a refused token is being cleared stays signed in', async () => {
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
  await auth.startSession({ accessToken: 'a1', refreshToken: 'a-r1' });
  const clearing = new Gate();
  store.pendingClear = clearing.opened;
  const ended: SessionEnd[] = [];
  auth.onSessionEnd((end) => {
    ended.push(end);
  });

  const refused = assert.rejects(auth.sessionRequest('GET', '/me'));
  for (let turn = 0; turn < 50 && ended.length === 0; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.deepEqual(
    ended.map((end) => end.reason),
    ['refused'],
  );
  const signingIn = auth.startSession({ accessToken: 'a3', refreshToken: 'a-r3' });
  clearing.open();
  await Promise.all([refused, signingIn]);

  assert.equal(await auth.accessToken(), 'a3');
  assert.deepEqual(
    ended.map((end) => end.reason),
    ['refused', 'replaced'],
  );
});

test('a sign-in stores its refresh token with the user it belongs to', async () => {
  const ctx = new FakeCtx(async () => ({ ok: true }));
  const store = new MemoryStore(null, 'x');
  const auth = new SessionAuth(ctx.send, store, ownerOf);
  await auth.startSession({ accessToken: 'b1', refreshToken: 'b-r1' });
  assert.deepEqual(await store.readSession(), { refreshToken: 'b-r1', owner: 'b' });
});

test('a refresh that yields a token without a readable owner is refused once and clears the stored token', async () => {
  const ctx = new FakeCtx(async ({ path }) => {
    if (path === '/refresh-token') {
      return { accessToken: 'not-a-jwt', refreshToken: 'r2' };
    }
    return { ok: true };
  });
  const store = new MemoryStore('r1');
  const auth = new SessionAuth(ctx.send, store, (accessToken) => {
    throw new SyntaxError(`Unexpected token ${accessToken}`);
  });
  let ended = 0;
  auth.onSessionEnd(() => {
    ended += 1;
  });

  await assert.rejects(auth.sessionRequest('GET', '/me'), /Sign in first/);
  await assert.rejects(auth.sessionRequest('GET', '/me'), /Sign in first/);

  assert.equal(ctx.refreshes(), 1);
  assert.equal(store.refreshToken, null);
  assert.equal(ended, 1);
  assert.deepEqual(ctx.tokensFor('/me'), []);
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
  await auth.clearSession('signed-out');
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

class HookedStore extends MemoryStore {
  heldRead: Gate | null = null;
  heldWrite: Gate | null = null;
  afterExclusive: (() => void) | null = null;

  async readSession(): Promise<StoredSession | null> {
    const snapshot = await super.readSession();
    const held = this.heldRead;
    this.heldRead = null;
    await held?.opened;
    return snapshot;
  }

  async writeSession(session: StoredSession): Promise<void> {
    const held = this.heldWrite;
    this.heldWrite = null;
    await held?.opened;
    await super.writeSession(session);
  }

  async exclusive<T>(task: () => Promise<T>): Promise<T> {
    const result = await task();
    const hook = this.afterExclusive;
    this.afterExclusive = null;
    hook?.();
    return result;
  }
}

test('a refresh token CTX rejects after a new sign-in leaves the new session in place', async () => {
  const rotation = new Gate();
  const ends: SessionEnd[] = [];
  const ctx = new FakeCtx(async ({ path }) => {
    if (path === '/refresh-token') {
      await rotation.opened;
      throw unauthorized();
    }
    return { ok: true };
  });
  const store = new HookedStore('r1');
  const auth = new SessionAuth(ctx.send, store, ownerOf);
  auth.onSessionEnd((end) => ends.push(end));

  const request = auth.sessionRequest('GET', '/me');
  await new Promise((resolve) => setImmediate(resolve));
  await auth.startSession({ accessToken: 'a2', refreshToken: 'r2' });
  ends.length = 0;
  rotation.open();

  await assert.rejects(request, /Sign in first/);
  assert.equal(store.refreshToken, 'r2');
  assert.deepEqual(ends, []);
  assert.equal(await auth.accessToken(), 'a2');
});

test('a refresh that was waiting on the store when the session ended sends nothing', async () => {
  const ctx = new FakeCtx(async () => ({ accessToken: 'a2', refreshToken: 'r2' }));
  const store = new HookedStore('r1');
  const auth = new SessionAuth(ctx.send, store, ownerOf);
  store.heldRead = new Gate();
  const reading = store.heldRead;

  const request = auth.sessionRequest('GET', '/me');
  await new Promise((resolve) => setImmediate(resolve));
  await auth.clearSession('signed-out');
  reading.open();

  await assert.rejects(request, /Sign in first/);
  assert.equal(ctx.refreshes(), 0);
});

test('a request whose session ended while its token was replaced is not retried', async () => {
  const ctx = new FakeCtx(async ({ path, token }) => {
    if (path === '/refresh-token') {
      return { accessToken: 'a2', refreshToken: 'r2' };
    }
    if (token === 'a1') {
      throw unauthorized();
    }
    return { ok: true };
  });
  const store = new HookedStore(null);
  const auth = new SessionAuth(ctx.send, store, ownerOf);
  await auth.startSession({ accessToken: 'a1', refreshToken: 'r1' });
  store.afterExclusive = () => {
    void auth.clearSession('signed-out');
  };

  await assert.rejects(auth.sessionRequest('GET', '/me'), (error) => error instanceof CtxError && error.status === 401);
  assert.deepEqual(ctx.tokensFor('/me'), ['a1']);
});

test("a stale refresh that finds another user's token cannot end the session that replaced it", async () => {
  const ends: SessionEnd[] = [];
  const ctx = new FakeCtx(async ({ path, token }) => {
    if (path === '/refresh-token') {
      return { accessToken: 'b2', refreshToken: 'rb2' };
    }
    if (token === 'a1') {
      throw unauthorized();
    }
    return { ok: true };
  });
  const store = new HookedStore(null);
  const auth = new SessionAuth(ctx.send, store, ownerOf);
  await auth.startSession({ accessToken: 'a1', refreshToken: 'r1' });
  auth.onSessionEnd((end) => ends.push(end));
  store.signedInElsewhere('rb', 'b');

  const refused = assert.rejects(auth.sessionRequest('GET', '/me'));
  await new Promise((resolve) => setImmediate(resolve));
  await auth.startSession({ accessToken: 'a3', refreshToken: 'r3' });
  ends.length = 0;

  await refused;
  assert.deepEqual(ends, []);
  assert.equal(await auth.accessToken(), 'a3');
});
