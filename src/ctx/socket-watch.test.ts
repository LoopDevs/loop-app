import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';

import { SocketWatch, type WatchedSocket } from './socket-watch.ts';

class FakeSocket implements WatchedSocket {
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  readonly sent: string[] = [];
  closed = false;

  constructor(readonly accessToken: string) {}

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.onclose?.();
  }

  open(): void {
    this.onopen?.();
  }

  drop(): void {
    this.onclose?.();
  }
}

class FakeAuth {
  readonly sockets: FakeSocket[] = [];
  readonly replaced: string[] = [];
  accessToken: string | null = 'a1';
  private readonly listeners = new Set<() => void>();
  private issued = 1;

  async requireAccessToken(): Promise<string> {
    if (this.accessToken === null) {
      throw new Error('Sign in first');
    }
    return this.accessToken;
  }

  async replacement(rejected: string): Promise<string> {
    this.replaced.push(rejected);
    this.issued += 1;
    this.accessToken = `a${this.issued}`;
    return this.accessToken;
  }

  onSessionEnd(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  endSession(): void {
    this.accessToken = null;
    this.listeners.forEach((listener) => listener());
  }

  open = (accessToken: string): WatchedSocket => {
    const socket = new FakeSocket(accessToken);
    this.sockets.push(socket);
    return socket;
  };

  latest(): FakeSocket {
    return this.sockets[this.sockets.length - 1];
  }
}

const subscribe = (topic: string) => JSON.stringify({ action: 'subscribe', topic });

let auth: FakeAuth;
let received: unknown[];
let presence: string[];
let watch: SocketWatch;

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
  auth = new FakeAuth();
  received = [];
  presence = [];
  watch = new SocketWatch(auth, auth.open, 'account', (raw) => received.push(raw), {
    attach: () => presence.push('attach'),
    detach: () => presence.push('detach'),
  });
});

afterEach(() => {
  watch.close();
  mock.timers.reset();
});

async function retryAfter(ms: number): Promise<void> {
  mock.timers.tick(ms);
  await new Promise((resolve) => setImmediate(resolve));
}

test('an open socket subscribes to the topic, attaches and passes messages on', async () => {
  const close = await watch.start();
  const [socket] = auth.sockets;
  assert.equal(socket.accessToken, 'a1');

  socket.open();
  socket.onmessage?.({ data: 'hello' });
  close();

  assert.deepEqual(socket.sent, [subscribe('account')]);
  assert.deepEqual(received, ['hello']);
  assert.equal(socket.closed, true);
  assert.deepEqual(presence, ['attach', 'detach']);
  assert.equal(auth.sockets.length, 1);
});

test('a socket that drops after opening reconnects with the same token after a delay', async () => {
  await watch.start();
  auth.sockets[0].open();
  auth.sockets[0].drop();
  assert.deepEqual(presence, ['attach', 'detach']);

  await retryAfter(SocketWatch.retryDelayMs - 1);
  assert.equal(auth.sockets.length, 1);
  await retryAfter(1);

  assert.equal(auth.sockets.length, 2);
  assert.equal(auth.sockets[1].accessToken, 'a1');
  assert.deepEqual(auth.replaced, []);
});

test('a failed handshake reconnects with a replacement token', async () => {
  await watch.start();
  auth.sockets[0].drop();

  await retryAfter(SocketWatch.retryDelayMs);

  assert.deepEqual(auth.replaced, ['a1']);
  assert.equal(auth.sockets[1].accessToken, 'a2');
});

test('retries back off and stop after the attempt limit', async () => {
  await watch.start();
  for (let attempt = 0; attempt < SocketWatch.maxAttempts; attempt += 1) {
    auth.latest().drop();
    const opened = auth.sockets.length;
    await retryAfter(SocketWatch.retryDelayMs * 2 ** attempt - 1);
    assert.equal(auth.sockets.length, opened);
    await retryAfter(1);
    assert.equal(auth.sockets.length, opened + 1);
  }

  auth.latest().drop();
  await retryAfter(SocketWatch.retryDelayMs * 2 ** SocketWatch.maxAttempts);

  assert.equal(auth.sockets.length, SocketWatch.maxAttempts + 1);
});

test('an open socket resets the attempt count', async () => {
  await watch.start();
  auth.sockets[0].drop();
  await retryAfter(SocketWatch.retryDelayMs);
  auth.sockets[1].open();
  auth.sockets[1].drop();

  await retryAfter(SocketWatch.retryDelayMs);

  assert.equal(auth.sockets.length, 3);
});

test('a retry that cannot get a token tries again later with the current one', async () => {
  await watch.start();
  auth.sockets[0].drop();
  auth.replacement = async () => {
    throw new TypeError('Network request failed');
  };

  await retryAfter(SocketWatch.retryDelayMs);
  assert.equal(auth.sockets.length, 1);
  await retryAfter(SocketWatch.retryDelayMs * 2);

  assert.equal(auth.sockets.length, 2);
  assert.equal(auth.sockets[1].accessToken, 'a1');
});

test('the session ending closes the socket and stops the retries', async () => {
  await watch.start();
  auth.sockets[0].open();

  auth.endSession();
  await retryAfter(SocketWatch.retryDelayMs * 2 ** SocketWatch.maxAttempts);

  assert.equal(auth.sockets[0].closed, true);
  assert.equal(auth.sockets.length, 1);
});

test('a pending retry is dropped when the watch closes', async () => {
  const close = await watch.start();
  auth.sockets[0].drop();

  close();
  await retryAfter(SocketWatch.retryDelayMs * 2 ** SocketWatch.maxAttempts);

  assert.equal(auth.sockets.length, 1);
});

test('starting without a session fails before any socket is opened', async () => {
  auth.accessToken = null;

  await assert.rejects(watch.start(), /Sign in first/);

  assert.equal(auth.sockets.length, 0);
});
