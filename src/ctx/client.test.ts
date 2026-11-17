import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';

import { Platform } from 'react-native';

import { errorReporting } from '../ops/error-reporting.ts';
import { ctx, CtxError, type GiftCardOrderIn } from './client.ts';
import { Deadline, RequestTimeoutError } from './deadline.ts';

type Sent = {
  url: string;
  method: string | undefined;
  headers: Record<string, string>;
  body: unknown;
};

class FakeWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  readonly sent: string[] = [];
  closed = false;

  constructor(
    readonly url: string,
    readonly protocols: undefined,
    readonly options: { headers: Record<string, string> },
  ) {
    sockets.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.onclose?.();
  }
}

const realFetch = globalThis.fetch;
const realWebSocket = globalThis.WebSocket;
const realReportMessage = errorReporting.reportMessage;
const apiUrl = 'https://staging.spend.ctx.com';

let sent: Sent[] = [];
let sockets: FakeWebSocket[] = [];
let reported: string[] = [];
let respond: (request: Sent) => Response | Promise<Response>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function accessToken(userId: string): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ tid: userId })}.signature`;
}

async function signIn(userId: string): Promise<void> {
  respond = () => json({ accessToken: accessToken(userId), refreshToken: 'refresh-1' });
  await ctx.verifyCode('a@example.com', '123456');
  sent = [];
}

beforeEach(() => {
  sent = [];
  sockets = [];
  reported = [];
  respond = () => json({});
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  errorReporting.reportMessage = (message) => {
    reported.push(message);
  };
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const request: Sent = {
      url: String(input),
      method: init?.method,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    sent.push(request);
    return respond(request);
  }) as typeof fetch;
});

afterEach(async () => {
  mock.timers.reset();
  respond = () => json({});
  await ctx.signOut();
  globalThis.fetch = realFetch;
  globalThis.WebSocket = realWebSocket;
  errorReporting.reportMessage = realReportMessage;
});

test('a status read goes to the CTX API with the client id and no session', async () => {
  respond = () => json({ maintenance: true });
  assert.deepEqual(await ctx.status(), { maintenance: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, `${apiUrl}/status`);
  assert.equal(sent[0].method, 'GET');
  assert.equal(sent[0].headers['X-Client-Id'], 'loopapp');
  assert.equal(sent[0].headers.Authorization, undefined);
});

test('maintenance reads as on only when CTX says true', async () => {
  respond = () => json({ maintenance: 'yes' });
  assert.deepEqual(await ctx.status(), { maintenance: false });
  respond = () => new Response('', { status: 200 });
  assert.deepEqual(await ctx.status(), { maintenance: false });
});

test('a maintenance refusal reaches the service-state listener and is not reported', async () => {
  const states: string[] = [];
  ctx.onServiceState((state) => states.push(state));
  respond = () => json({ error: 'ErrMaintenanceMode' }, 503);
  await assert.rejects(ctx.status(), (error: unknown) => {
    assert.ok(error instanceof CtxError);
    assert.equal(error.status, 503);
    assert.equal(error.message, 'Loop is down for maintenance');
    return true;
  });
  assert.deepEqual(states, ['maintenance']);
  assert.deepEqual(reported, []);
});

test('a disabled client reaches the listener as app-disabled', async () => {
  const states: string[] = [];
  ctx.onServiceState((state) => states.push(state));
  respond = () => json({ error: 'ErrClientDisabled' }, 403);
  await assert.rejects(ctx.status(), (error: unknown) => error instanceof CtxError && error.status === 403);
  assert.deepEqual(states, ['app-disabled']);
  assert.deepEqual(reported, []);
});

test('the purchase kill switch is shown on the error but does not block the app', async () => {
  const states: string[] = [];
  ctx.onServiceState((state) => states.push(state));
  respond = () => json({ error: 'ErrKillSwitchActive' }, 503);
  await assert.rejects(ctx.status(), /Gift card purchases are paused/);
  assert.deepEqual(states, []);
  assert.deepEqual(reported, []);
});

test('a server error is reported with its status and name and shown generically', async () => {
  const states: string[] = [];
  ctx.onServiceState((state) => states.push(state));
  respond = () => json({ error: 'ErrInternal', detail: 'stack at line 3' }, 500);
  await assert.rejects(ctx.status(), (error: unknown) => {
    assert.ok(error instanceof CtxError);
    assert.equal(error.message, CtxError.serverFailedMessage);
    return true;
  });
  assert.deepEqual(reported, ['CTX 500 ErrInternal']);
  assert.deepEqual(states, []);
});

test('a client error is neither reported nor sent to the listener', async () => {
  const states: string[] = [];
  ctx.onServiceState((state) => states.push(state));
  respond = () => json({ error: 'ErrAmountBelowMinimum' }, 400);
  await assert.rejects(ctx.status(), (error: unknown) => {
    assert.ok(error instanceof CtxError);
    assert.equal(error.message, CtxError.requestFailedMessage);
    assert.equal(error.errorName(), 'ErrAmountBelowMinimum');
    return true;
  });
  assert.deepEqual(reported, []);
  assert.deepEqual(states, []);
});

test('a listener that unsubscribed hears nothing and a newer listener is kept', async () => {
  const first: string[] = [];
  const second: string[] = [];
  const stopFirst = ctx.onServiceState((state) => first.push(state));
  const stopSecond = ctx.onServiceState((state) => second.push(state));
  stopFirst();
  respond = () => json({ error: 'ErrMaintenanceMode' }, 503);
  await assert.rejects(ctx.status());
  assert.deepEqual(first, []);
  assert.deepEqual(second, ['maintenance']);
  stopSecond();
  await assert.rejects(ctx.status());
  assert.deepEqual(second, ['maintenance']);
});

test('a request that never answers fails with the timeout error', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  respond = () => new Promise<Response>(() => undefined);
  const pending = ctx.status();
  const outcome = assert.rejects(pending, RequestTimeoutError);
  mock.timers.tick(Deadline.requestMs);
  await outcome;
});

test('an email sign-in refused for the account explains it and keeps the CTX error as the cause', async () => {
  respond = () => json({ error: 'ErrAuthMethodNotAllowedForUser' }, 403);
  await assert.rejects(ctx.requestCode('a@example.com'), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, 'Email sign-in is turned off for this account. Contact support.');
    assert.ok(error.cause instanceof CtxError);
    return true;
  });
  assert.deepEqual(sent[0].body, { email: 'a@example.com' });
  assert.equal(sent[0].url, `${apiUrl}/login`);
});

test('an unlisted sign-in refusal surfaces the CTX error itself', async () => {
  respond = () => json({ error: 'ErrSomethingNew' }, 403);
  await assert.rejects(ctx.requestCode('a@example.com'), (error: unknown) => error instanceof CtxError);
});

test('a wrong email code shows the code message', async () => {
  respond = () => json({ error: 'ErrInvalidCode' }, 400);
  await assert.rejects(ctx.verifyCode('a@example.com', '000000'), /That code didn't work/);
  assert.equal(await ctx.isSignedIn(), false);
});

test('a social sign-in refusal names the provider', async () => {
  respond = () => json({ error: 'ErrOAuthEmailUnverified' }, 400);
  await assert.rejects(
    ctx.signInWithOAuth('google', { idToken: 'id-token' }),
    /Google hasn't verified the email/,
  );
  assert.deepEqual(sent[0].body, { provider: 'google', idToken: 'id-token' });
  assert.equal(sent[0].url, `${apiUrl}/login/oauth`);
});

test('after signing in, account reads go to the user id inside the access token with the bearer token', async () => {
  await signIn('user-42');
  respond = () => json({ wallet: null, payouts: null });
  const account = await ctx.account();
  assert.deepEqual(account.onTheWay({ stableCurrency: undefined, savesCashback: () => false }), []);
  assert.equal(sent[0].url, `${apiUrl}/users/user-42/account`);
  assert.equal(sent[0].headers.Authorization, `Bearer ${accessToken('user-42')}`);
  assert.equal(await ctx.userId(), 'user-42');
});

test('a new sign-in ends the previous session at CTX only once the new tokens exist', async () => {
  await signIn('user-42');
  respond = (request) =>
    request.url.endsWith('/verify-email')
      ? json({ accessToken: accessToken('user-77'), refreshToken: 'refresh-2' })
      : json({});
  await ctx.verifyCode('b@example.com', '654321');
  assert.deepEqual(
    sent.map((request) => request.url.replace(apiUrl, '')),
    ['/verify-email', '/logout'],
  );
  assert.equal(sent[1].headers.Authorization, `Bearer ${accessToken('user-42')}`);
  assert.equal(await ctx.userId(), 'user-77');
});

test('ending the previous session refreshes its expired token and retries', async () => {
  await signIn('user-42');
  const refreshed = `${accessToken('user-42')}.refreshed`;
  respond = (request) => {
    if (request.url.endsWith('/verify-email')) {
      return json({ accessToken: accessToken('user-77'), refreshToken: 'refresh-2' });
    }
    if (request.url.endsWith('/refresh-token')) {
      return json({ accessToken: refreshed, refreshToken: 'refresh-1b' });
    }
    return request.headers.Authorization === `Bearer ${refreshed}` ? json({}) : json({ error: 'ErrTokenInvalid' }, 401);
  };
  await ctx.verifyCode('b@example.com', '654321');
  assert.deepEqual(
    sent.map((request) => request.url.replace(apiUrl, '')),
    ['/verify-email', '/logout', '/refresh-token', '/logout'],
  );
  assert.equal(sent[3].headers.Authorization, `Bearer ${refreshed}`);
  respond = () => json({});
  assert.equal(await ctx.userId(), 'user-77');
});

test('a refused code leaves the current session signed in', async () => {
  await signIn('user-42');
  respond = () => json({ error: 'ErrVerificationCodeInvalid' }, 400);
  await assert.rejects(ctx.verifyCode('b@example.com', '000000'), CtxError);
  assert.deepEqual(
    sent.map((request) => request.url.replace(apiUrl, '')),
    ['/verify-email'],
  );
  respond = () => json({});
  assert.equal(await ctx.userId(), 'user-42');
});

test('signing out clears the session even when the logout call fails', async () => {
  await signIn('user-42');
  respond = () => json({ error: 'ErrInternal' }, 500);
  await ctx.signOut();
  assert.equal(await ctx.isSignedIn(), false);
  assert.equal(await ctx.hasSession(), false);
});

test('the catalog is read without a session and with one it uses the bearer token', async () => {
  respond = () => json({ result: null, pagination: { page: 1, pages: 0, perPage: 20, total: 0 } });
  const page = await ctx.merchants({ country: 'GB' });
  assert.deepEqual(page.result, []);
  const query = new URL(sent[0].url).searchParams;
  assert.equal(new URL(sent[0].url).pathname, '/merchants');
  assert.equal(query.get('enabled'), '1');
  assert.equal(query.get('country'), 'GB');
  assert.equal(query.get('order'), 'name');
  assert.equal(sent[0].headers.Authorization, undefined);
  await signIn('user-42');
  await ctx.merchants({ country: 'GB' });
  assert.equal(sent[0].headers.Authorization, `Bearer ${accessToken('user-42')}`);
});

test('a signed-out merchant lookup matches the slug whole', async () => {
  const merchant = (slug: string) => ({
    id: `id-${slug}`,
    slug,
    name: slug,
    country: 'US',
    currency: 'USD',
    denominationType: 'fixed',
    denominationValues: ['25'],
    userDiscount: 300,
  });
  const pagination = { page: 1, pages: 1, perPage: 20, total: 2 };
  respond = () => json({ result: [merchant('babygap-us'), merchant('gap-us')], pagination });
  const found = await ctx.merchant('gap-us');
  assert.equal(new URL(sent[0].url).searchParams.get('slug'), '^gap-us$');
  assert.equal(sent[0].headers.Authorization, undefined);
  assert.equal(found.slug, 'gap-us');
  respond = () => json({ result: [merchant('babygap-us')], pagination });
  await assert.rejects(ctx.merchant('gap-us'), { message: 'We couldn’t find that gift card.' });
});

test('a missing gift card list reads as empty and status filters are joined', async () => {
  await signIn('user-42');
  respond = () => json({ result: null, pagination: { page: 1, pages: 0, perPage: 5, total: 0 } });
  const page = await ctx.giftCards({ status: ['unpaid', 'paid'], notStatus: ['expired'], perPage: 5 });
  assert.deepEqual(page.result, []);
  const query = new URL(sent[0].url).searchParams;
  assert.equal(query.get('status'), 'unpaid,paid');
  assert.equal(query.get('status!'), 'expired');
  assert.equal(query.get('perPage'), '5');
});

const order: GiftCardOrderIn = {
  merchantId: 'm1',
  fiatAmount: '25',
  fiatCurrency: 'GBP',
  cryptoCurrency: 'XLM.USDC',
};

function card(overrides: Partial<Record<'cardFiatAmount' | 'merchantId' | 'cardFiatCurrency', string>>) {
  return {
    id: 'g1',
    status: 'unpaid',
    paymentStatus: 'unpaid',
    merchantId: 'm1',
    merchantName: 'Merchant One',
    created: '2026-10-27T10:00:00Z',
    cardFiatAmount: '25.00',
    cardFiatCurrency: 'GBP',
    paymentId: 'p1',
    paymentMethod: 'crypto',
    paymentCryptoCurrency: 'XLM.USDC',
    ...overrides,
  };
}

test('an order is sent as a cashback order and a matching card is returned', async () => {
  await signIn('user-42');
  respond = () => json(card({}));
  const placed = await ctx.orderGiftCard(order);
  assert.equal(placed.id, 'g1');
  assert.equal(sent[0].method, 'POST');
  assert.equal(sent[0].url, `${apiUrl}/gift-cards`);
  assert.deepEqual(sent[0].body, { ...order, rewardType: 'cashback', platform: 'ios' });
  assert.deepEqual(reported, []);
});

test('an order whose answer is lost is recovered from the unpaid orders placed since it was asked', async () => {
  await signIn('user-42');
  const placed = { ...card({}), created: new Date().toISOString() };
  respond = (request) => {
    if (request.method === 'POST') {
      throw new TypeError('Network request failed');
    }
    return request.url.startsWith(`${apiUrl}/gift-cards?`)
      ? json({ result: [placed], pagination: { page: 1, pages: 1, perPage: 5, total: 1 } })
      : json(placed);
  };
  const recovered = await ctx.orderGiftCard(order);
  assert.equal(recovered.id, 'g1');
  assert.deepEqual(
    sent.map((request) => request.method),
    ['POST', 'GET', 'GET'],
  );
  assert.equal(new URL(sent[1].url).searchParams.get('status'), 'unpaid');
  assert.deepEqual(reported, ['CTX order recovered after a lost answer']);
});

test('a lost answer adopts the newest placed order the caller accepts', async () => {
  await signIn('user-42');
  const now = Date.now();
  const older = { ...card({}), id: 'g-old', created: new Date(now - 60_000).toISOString() };
  const cancelled = { ...card({}), id: 'g-cancelled', created: new Date(now).toISOString() };
  const fetched: string[] = [];
  respond = (request) => {
    if (request.method === 'POST') {
      throw new TypeError('Network request failed');
    }
    if (request.url.startsWith(`${apiUrl}/gift-cards?`)) {
      return json({ result: [older, cancelled], pagination: { page: 1, pages: 1, perPage: 5, total: 2 } });
    }
    fetched.push(request.url);
    return json(older);
  };
  const recovered = await ctx.orderGiftCard(order, async (placed) => placed.id !== 'g-cancelled');
  assert.equal(recovered.id, 'g-old');
  assert.deepEqual(fetched, [`${apiUrl}/gift-cards/g-old`]);
});

test('a lost answer with no order placed since fails and keeps the idempotency key for the retry', async () => {
  await signIn('user-42');
  respond = (request) => {
    if (request.method === 'POST') {
      throw new TypeError('Network request failed');
    }
    return json({ result: [], pagination: { page: 1, pages: 0, perPage: 5, total: 0 } });
  };
  await assert.rejects(ctx.orderGiftCard(order), TypeError);
  respond = () => json(card({}));
  await ctx.orderGiftCard(order);
  const posts = sent.filter((request) => request.method === 'POST');
  assert.equal(posts.length, 2);
  assert.equal(posts[1].headers['Idempotency-Key'], posts[0].headers['Idempotency-Key']);
  assert.deepEqual(reported, []);
});

test('an order CTX answers with a server failure is recovered when it was placed', async () => {
  await signIn('user-42');
  const placed = { ...card({}), created: new Date().toISOString() };
  respond = (request) => {
    if (request.method === 'POST') {
      return json({ error: 'ErrInternal' }, 502);
    }
    return request.url.startsWith(`${apiUrl}/gift-cards?`)
      ? json({ result: [placed], pagination: { page: 1, pages: 1, perPage: 5, total: 1 } })
      : json(placed);
  };
  const recovered = await ctx.orderGiftCard(order);
  assert.equal(recovered.id, 'g1');
  assert.deepEqual(reported, ['CTX 502 ErrInternal', 'CTX order recovered after a lost answer']);
});

test('an order CTX answers with a server failure fails with that answer when none was placed', async () => {
  await signIn('user-42');
  respond = (request) =>
    request.method === 'POST'
      ? json({ error: 'ErrInternal' }, 502)
      : json({ result: [], pagination: { page: 1, pages: 0, perPage: 5, total: 0 } });
  await assert.rejects(ctx.orderGiftCard(order), (error: unknown) => error instanceof CtxError && error.status === 502);
});

test('a refused order is not looked up', async () => {
  await signIn('user-42');
  respond = () => json({ error: 'ErrAmountTooLow' }, 400);
  await assert.rejects(ctx.orderGiftCard(order), CtxError);
  assert.deepEqual(
    sent.map((request) => request.method),
    ['POST'],
  );
});

test('a card that differs from the order is rejected and reported', async () => {
  await signIn('user-42');
  for (const wrong of [{ cardFiatAmount: '250.00' }, { merchantId: 'm2' }, { cardFiatCurrency: 'USD' }]) {
    reported = [];
    respond = () => json(card(wrong));
    await assert.rejects(ctx.orderGiftCard(order), /CTX order does not match the request/);
    assert.deepEqual(reported, ['CTX order does not match the request']);
  }
});

test('a gift card id is encoded into the path', async () => {
  await signIn('user-42');
  respond = () => json(card({}));
  await ctx.giftCard('a/b?c');
  assert.equal(sent[0].url, `${apiUrl}/gift-cards/a%2Fb%3Fc`);
});

test('the active order is the newest in-progress card that is not skipped', async () => {
  await signIn('user-42');
  const pagination = { page: 1, pages: 1, perPage: 5, total: 2 };
  respond = (request) =>
    request.url.endsWith('/gift-cards/g2')
      ? json({ ...card({}), id: 'g2' })
      : json({ result: [card({}), { ...card({}), id: 'g2' }], pagination });
  const active = await ctx.activeGiftCard('m1', (candidate) => candidate.id === 'g1');
  assert.equal(active?.id, 'g2');
  assert.equal(sent[1].url, `${apiUrl}/gift-cards/g2`);
  respond = () => json({ result: [card({})], pagination });
  assert.equal(await ctx.activeGiftCard('m1', () => true), null);
});

test('the active order is found on a later page when the first page holds only skipped orders', async () => {
  await signIn('user-42');
  respond = (request) => {
    if (request.url.endsWith('/gift-cards/g9')) {
      return json({ ...card({}), id: 'g9' });
    }
    const page = Number(new URL(request.url).searchParams.get('page') ?? '1');
    const result = page === 2 ? [{ ...card({}), id: 'g9' }] : [card({})];
    return json({ result, pagination: { page, pages: 2, perPage: 5, total: 6 } });
  };
  const active = await ctx.activeGiftCard('m1', (candidate) => candidate.id === 'g1');
  assert.equal(active?.id, 'g9');
  sent = [];
  assert.equal(await ctx.activeGiftCard('m1', () => true), null);
  assert.equal(sent.length, 2);
});

test('an account watch opens a socket with the session headers and relays account events', async () => {
  await signIn('user-42');
  await ctx.status();
  const clientId = sent[0].headers['X-Client-Id'];
  let changes = 0;

  const close = await ctx.watchAccount(() => {
    changes += 1;
  });
  const [socket] = sockets;
  socket.onopen?.();
  socket.onmessage?.({ data: JSON.stringify({ type: 'event', topic: 'order', data: {} }) });
  socket.onmessage?.({ data: JSON.stringify({ type: 'event', topic: 'account', data: {} }) });
  close();

  assert.equal(sockets.length, 1);
  assert.equal(socket.url, 'wss://staging.spend.ctx.com/ws');
  assert.equal(socket.options.headers.Authorization, `Bearer ${accessToken('user-42')}`);
  assert.equal(socket.options.headers['X-Client-Id'], clientId);
  assert.deepEqual(socket.sent, [JSON.stringify({ action: 'subscribe', topic: 'account' })]);
  assert.equal(changes, 1);
  assert.equal(socket.closed, true);
});

test('an account watch on the web opens no socket', async () => {
  await signIn('user-42');
  Platform.OS = 'web';
  try {
    const close = await ctx.watchAccount(() => undefined);
    close();
  } finally {
    Platform.OS = 'ios';
  }

  assert.equal(sockets.length, 0);
});

test('signing out closes an open account socket', async () => {
  await signIn('user-42');
  await ctx.watchAccount(() => undefined);
  sockets[0].onopen?.();

  await ctx.signOut();

  assert.equal(sockets[0].closed, true);
  assert.equal(sockets.length, 1);
});

const walletJson = { id: 'w-1', chain: 'stellar', address: 'CWALLET', sponsored: true, status: 'active' };
const intent = { intent: 'vault_withdraw', currency: 'XLM.USDC', shares: '40' } as const;
const builtJson = { transaction: 'AAAA', digest: 'ab12', contextRuleIds: [1, 2], expiryLedger: 900 };

test('the wallet list is read from the user wallets path and each link is parsed', async () => {
  await signIn('user-42');
  respond = () => json({ result: [walletJson] });
  assert.deepEqual(await ctx.wallets(), [walletJson]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].method, 'GET');
  assert.equal(sent[0].url, `${apiUrl}/users/user-42/wallets`);
  assert.equal(sent[0].body, undefined);
});

test('a wallet list with no result reads as empty and a non-list result is rejected', async () => {
  await signIn('user-42');
  respond = () => json({ result: null });
  assert.deepEqual(await ctx.wallets(), []);
  respond = () => json({ result: 'wallets' });
  await assert.rejects(ctx.wallets(), { name: 'UnexpectedResponse' });
  assert.deepEqual(reported, ['CTX wallets response is not a list']);
});

test('a wallet deployment is posted for the given user with the passkey and device keys', async () => {
  await signIn('user-42');
  respond = () => json(walletJson);
  const body = { credentialId: 'cred', passkeyPublicKey: 'pk', devicePublicKey: 'dk' };
  assert.deepEqual(await ctx.deployWallet('user-7', body), walletJson);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].method, 'POST');
  assert.equal(sent[0].url, `${apiUrl}/users/user-7/wallets/deploy`);
  assert.deepEqual(sent[0].body, body);
});

test('a wallet deployment answer without a boolean sponsored flag is rejected and reported', async () => {
  await signIn('user-42');
  respond = () => json({ ...walletJson, sponsored: 'yes' });
  const body = { credentialId: 'cred', passkeyPublicKey: 'pk', devicePublicKey: 'dk' };
  await assert.rejects(ctx.deployWallet('user-42', body), { name: 'UnexpectedResponse' });
  assert.deepEqual(reported, ['CTX wallet link response has an unexpected sponsored']);
});

test('a transaction is built by posting the intent to the wallet transaction path', async () => {
  await signIn('user-42');
  respond = () => json(builtJson);
  assert.deepEqual(await ctx.buildTransaction('w-1', intent), builtJson);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].method, 'POST');
  assert.equal(sent[0].url, `${apiUrl}/users/user-42/wallets/w-1/stellar/transaction`);
  assert.deepEqual(sent[0].body, intent);
});

test('a built transaction with a malformed field is rejected and reported', async () => {
  await signIn('user-42');
  respond = () => json({ ...builtJson, contextRuleIds: [1, 'x'] });
  await assert.rejects(ctx.buildTransaction('w-1', intent), { name: 'UnexpectedResponse' });
  respond = () => json({ ...builtJson, expiryLedger: 9.5 });
  await assert.rejects(ctx.buildTransaction('w-1', intent), { name: 'UnexpectedResponse' });
  respond = () => json({ ...builtJson, digest: undefined });
  await assert.rejects(ctx.buildTransaction('w-1', intent), { name: 'UnexpectedResponse' });
  assert.deepEqual(reported, [
    'CTX built transaction response has an unexpected contextRuleIds',
    'CTX built transaction response has an unexpected expiryLedger',
    'CTX built transaction response has an unexpected digest',
  ]);
});

test('a device-signed transaction is sponsored with the intent and signature in one body', async () => {
  await signIn('user-42');
  respond = () => json({ hash: 'h1', status: 'PENDING' });
  const signed = { transaction: 'AAAA', signature: 'sig', devicePublicKey: 'dk' };
  assert.deepEqual(await ctx.sponsorTransaction('w-1', intent, signed), { hash: 'h1', status: 'PENDING' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].method, 'POST');
  assert.equal(sent[0].url, `${apiUrl}/users/user-42/wallets/w-1/stellar/sponsor`);
  assert.deepEqual(sent[0].body, { ...intent, ...signed });
});

test('a passkey-signed transaction is sponsored with the passkey signature in the body', async () => {
  await signIn('user-42');
  respond = () => json({ hash: 'h2', status: 'FAILED', error: 'ErrSimulation' });
  const passkey = { publicKey: 'pk', authenticatorData: 'ad', clientDataJson: 'cd', signature: 'sg' };
  const result = await ctx.sponsorTransaction('w-1', { intent: 'pay', paymentId: 'p-1' }, { transaction: 'AAAA', passkey });
  assert.deepEqual(result, { hash: 'h2', status: 'FAILED', error: 'ErrSimulation' });
  assert.deepEqual(sent[0].body, { intent: 'pay', paymentId: 'p-1', transaction: 'AAAA', passkey });
});

test('a sponsor answer with a missing hash or a non-string error is rejected and reported', async () => {
  await signIn('user-42');
  const signed = { transaction: 'AAAA', signature: 'sig', devicePublicKey: 'dk' };
  respond = () => json({ status: 'PENDING' });
  await assert.rejects(ctx.sponsorTransaction('w-1', intent, signed), { name: 'UnexpectedResponse' });
  respond = () => json({ hash: 'h1', status: 'PENDING', error: 5 });
  await assert.rejects(ctx.sponsorTransaction('w-1', intent, signed), { name: 'UnexpectedResponse' });
  respond = () => json([]);
  await assert.rejects(ctx.sponsorTransaction('w-1', intent, signed), { name: 'UnexpectedResponse' });
  assert.deepEqual(reported, [
    'CTX sponsor response has an unexpected hash',
    'CTX sponsor response has an unexpected error',
    'CTX sponsor response is not an object',
  ]);
});

test('a successful answer that is not JSON is rejected with the server-failed message and reported', async () => {
  await signIn('user-42');
  respond = () => new Response('<html>gateway</html>', { status: 200 });
  await assert.rejects(ctx.wallets(), { name: 'UnexpectedResponse', message: CtxError.serverFailedMessage });
  assert.deepEqual(reported, ['CTX answered with a body that is not JSON']);
});

const bankOrder: GiftCardOrderIn = {
  merchantId: 'm1',
  fiatAmount: '25',
  fiatCurrency: 'GBP',
};

function bankCard(id: string, created: string, paymentUrlExpiration: string) {
  return {
    ...card({}),
    id,
    created,
    paymentMethod: 'plaid-uk-eu',
    paymentCryptoCurrency: undefined,
    plaidLinkToken: `link-${id}`,
    paymentUrlExpiration,
  };
}

const cardList = (cards: object[]) =>
  json({ result: cards, pagination: { page: 1, pages: 1, perPage: 10, total: cards.length } });

test('a bank order reuses the newest open order for the same request that can still be approved', async () => {
  await signIn('user-42');
  const soon = new Date(Date.now() + 600_000).toISOString();
  const past = new Date(Date.now() - 600_000).toISOString();
  const cards = [
    bankCard('g-older', '2026-10-27T10:00:00Z', soon),
    { ...bankCard('g-crypto', '2026-10-27T14:00:00Z', soon), paymentMethod: 'crypto' },
    { ...bankCard('g-other-amount', '2026-10-27T13:00:00Z', soon), cardFiatAmount: '50.00' },
    bankCard('g-open', '2026-10-27T11:00:00Z', soon),
    bankCard('g-expired', '2026-10-27T12:00:00Z', past),
  ];
  respond = (request) =>
    request.url.startsWith(`${apiUrl}/gift-cards?`)
      ? cardList(cards)
      : json(cards.find((candidate) => request.url.endsWith(`/${candidate.id}`)));
  const reused = await ctx.orderGiftCard(bankOrder);
  assert.equal(reused.id, 'g-open');
  assert.deepEqual(
    sent.map((request) => new URL(request.url).pathname.split('/').pop()),
    ['gift-cards', 'g-expired', 'g-open'],
  );
});

test('an open bank order made for another platform is not reused', async () => {
  await signIn('user-42');
  const soon = new Date(Date.now() + 600_000).toISOString();
  const webOrder = { ...bankCard('g-web', '2026-10-27T11:00:00Z', soon), plaidLinkToken: undefined, paymentUrl: 'https://secure.plaid.com/pay/1' };
  const created = bankCard('g-new', '2026-10-27T12:00:00Z', soon);
  respond = (request) => {
    if (request.method === 'POST') {
      return json(created);
    }
    return request.url.startsWith(`${apiUrl}/gift-cards?`) ? cardList([webOrder]) : json(webOrder);
  };
  assert.equal((await ctx.orderGiftCard(bankOrder)).id, 'g-new');
});

test('a bank order is not created when the open orders cannot be read', async () => {
  await signIn('user-42');
  respond = (request) => (request.method === 'POST' ? json(bankCard('g-new', '2026-10-27T12:00:00Z', '')) : new Response('{}', { status: 500 }));
  await assert.rejects(ctx.orderGiftCard(bankOrder));
  assert.equal(
    sent.some((request) => request.method === 'POST'),
    false,
  );
});

test('a bank order is created when no open order matches, and always when another bank is chosen', async () => {
  await signIn('user-42');
  const soon = new Date(Date.now() + 600_000).toISOString();
  const created = bankCard('g-new', '2026-10-27T12:00:00Z', soon);
  respond = (request) => (request.method === 'POST' ? json(created) : cardList([]));
  assert.equal((await ctx.orderGiftCard(bankOrder)).id, 'g-new');
  assert.deepEqual(
    sent.map((request) => request.method),
    ['GET', 'POST'],
  );
  sent = [];
  respond = (request) => (request.method === 'POST' ? json(created) : cardList([created]));
  assert.equal((await ctx.orderGiftCard({ ...bankOrder, chooseBank: true })).id, 'g-new');
  assert.deepEqual(
    sent.map((request) => request.method),
    ['POST'],
  );
});
