import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';

import { errorReporting } from '../ops/error-reporting.ts';
import { ctx, CtxError, type GiftCardOrderIn } from './client.ts';
import { Deadline, RequestTimeoutError } from './deadline.ts';

type Sent = {
  url: string;
  method: string | undefined;
  headers: Record<string, string>;
  body: unknown;
};

const realFetch = globalThis.fetch;
const realReportMessage = errorReporting.reportMessage;
const apiUrl = 'https://staging.spend.ctx.com';

let sent: Sent[] = [];
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
  reported = [];
  respond = () => json({});
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
    paymentMethod: 'XLM.USDC',
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
  assert.deepEqual(sent[0].body, { ...order, rewardType: 'cashback' });
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
