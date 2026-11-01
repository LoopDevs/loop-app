import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';

import { CatalogImage, CatalogPage, CatalogQuery, EdgeCache, serveImage } from './catalog.ts';

const s3 = 'https://ctx-spend.s3.us-west-2.amazonaws.com/0/abc';
const realFetch = globalThis.fetch;
const realCaches = globalThis.caches;
const env = { CTX_API_URL: 'https://ctx.test', CTX_CLIENT_ID: 'loopapp' };

function query(url: string): CatalogQuery {
  const parsed = CatalogQuery.from(new URL(url));
  assert.ok(parsed);
  return parsed;
}

function image(src: string, width = 256): CatalogImage | null {
  return CatalogImage.from(new URL(`https://loop.test/i?src=${encodeURIComponent(src)}&w=${width}`));
}

type CacheLog = { puts: string[]; deletes: string[] };

function fakeCache(stored: Response | undefined, log: CacheLog = { puts: [], deletes: [] }): Cache {
  return {
    match: async () => stored,
    put: async (key: string) => {
      log.puts.push(key);
    },
    delete: async (key: string) => {
      log.deletes.push(key);
      return true;
    },
  } as unknown as Cache;
}

function cachedAt(storedAt: number): Response {
  return new Response('old', {
    headers: { 'content-type': 'application/json', 'x-catalog-stored-at': String(storedAt) },
  });
}

afterEach(() => {
  mock.timers.reset();
  globalThis.fetch = realFetch;
  globalThis.caches = realCaches;
});

test('only whitelisted catalogue params reach CTX, in a stable order', () => {
  const parsed = query(
    'https://loop.test/api/catalog/merchants?perPage=24&country=US&token=x&userId=1&enabled=1&order=-discount,name',
  );
  assert.equal(parsed.upstreamUrl('https://ctx.test'), 'https://ctx.test/merchants?country=US&enabled=1&order=-discount%2Cname&perPage=24');
});

test('the same query in any param order shares one cache key', () => {
  const a = query('https://loop.test/x?country=GB&slug=%5Etesco%24');
  const b = query('https://loop.test/x?slug=%5Etesco%24&country=GB&utm=1');
  assert.equal(a.cacheKey('https://loop.test'), b.cacheKey('https://loop.test'));
});

test('a catalogue query is refused when a param is oversized or off its shape', () => {
  const refused = [
    `country=US&name=${'a'.repeat(600)}`,
    'name=%28',
    'slug=tesco',
    'ids=abc',
    'country=usa',
    'page=0',
    'perPage=10000',
    'order=name;drop',
    'enabled=true',
  ];
  for (const params of refused) {
    assert.equal(CatalogQuery.from(new URL(`https://loop.test/x?${params}`)), null, params);
  }
});

test('escaped search names and anchored lookups reach CTX', () => {
  assert.equal(
    query('https://loop.test/x?name=%5C%28gap%5C%29').upstreamUrl('https://ctx.test'),
    'https://ctx.test/merchants?name=%5C%28gap%5C%29',
  );
  assert.equal(
    query('https://loop.test/x?ids=%5Ea-1%24%2C%5Eb_2%24').upstreamUrl('https://ctx.test'),
    'https://ctx.test/merchants?ids=%5Ea-1%24%2C%5Eb_2%24',
  );
});

test('images resize only from the CTX bucket at the catalogue widths', () => {
  assert.ok(image(s3));
  assert.equal(image(s3, 300), null);
  assert.equal(image('https://evil.test/a.png'), null);
  assert.equal(image('https://ctx-spend.s3.us-west-2.amazonaws.com.evil.test/a'), null);
});

test('an image source is one plain bucket key', () => {
  assert.equal(image(`${s3}?x=1`), null);
  assert.equal(image(`${s3}#frag`), null);
  assert.equal(image('https://ctx-spend.s3.us-west-2.amazonaws.com/0//abc'), null);
  assert.equal(image('https://ctx-spend.s3.us-west-2.amazonaws.com/0/a%00b'), null);
  assert.equal(image('https://user:pw@ctx-spend.s3.us-west-2.amazonaws.com/0/abc'), null);
  assert.equal(image('https://CTX-SPEND.s3.us-west-2.amazonaws.com:443/0/abc')?.src, s3);
});

test('only image content types come back from the resizer', () => {
  assert.equal(CatalogImage.isImage('image/svg+xml; charset=utf-8'), true);
  assert.equal(CatalogImage.isImage('IMAGE/PNG'), true);
  assert.equal(CatalogImage.isImage('text/html'), false);
  assert.equal(CatalogImage.isImage(null), false);
});

test('catalogue pages point CTX images at the edge resizer and leave others alone', () => {
  const body = CatalogPage.withEdgeImages(
    JSON.stringify({ result: [{ logoUrl: s3, cardImageUrl: 'https://other.test/c.png' }] }),
  );
  assert.ok(body);
  const page = JSON.parse(body);
  assert.equal(page.result[0].logoUrl, `/api/catalog/image?src=${encodeURIComponent(s3)}&w=256`);
  assert.equal(page.result[0].cardImageUrl, 'https://other.test/c.png');
});

test('an empty catalogue page stays empty', () => {
  const body = CatalogPage.withEdgeImages('{"result":null}');
  assert.ok(body);
  assert.deepEqual(JSON.parse(body), { result: null });
});

test('a page that is not a JSON object is refused', () => {
  assert.equal(CatalogPage.withEdgeImages('<html>'), null);
  assert.equal(CatalogPage.withEdgeImages('null'), null);
  assert.equal(CatalogPage.withEdgeImages('"text"'), null);
});

test('the best image format follows the Accept header', () => {
  assert.equal(CatalogImage.format('image/avif,image/webp,*/*'), 'avif');
  assert.equal(CatalogImage.format('image/webp,*/*'), 'webp');
  assert.equal(CatalogImage.format(null), undefined);
});

test('cached entries are fresh inside the fresh window and servable inside the stale window', () => {
  const edge = new EdgeCache({} as Cache, () => undefined, { freshMs: 60_000, staleMs: 120_000 });
  assert.equal(edge.isFresh(1_000, 60_999), true);
  assert.equal(edge.isFresh(1_000, 61_000), false);
  assert.equal(edge.isServable(1_000, 120_999), true);
  assert.equal(edge.isServable(1_000, 121_000), false);
});

test('an entry inside the stale window is served while it refreshes in the background', async () => {
  mock.timers.enable({ apis: ['Date'], now: 200_000 });
  const background: Promise<unknown>[] = [];
  const edge = new EdgeCache(fakeCache(cachedAt(110_000)), (promise) => background.push(promise), {
    freshMs: 60_000,
    staleMs: 120_000,
  });
  const response = await edge.serve('https://loop.test/stale', async () => new Response('new'));
  assert.equal(response.headers.get('x-catalog-cache'), 'STALE');
  assert.equal(await response.text(), 'old');
  assert.equal(background.length, 1);
});

test('an entry past the stale window is reloaded before it is served', async () => {
  mock.timers.enable({ apis: ['Date'], now: 200_000 });
  const background: Promise<unknown>[] = [];
  const edge = new EdgeCache(fakeCache(cachedAt(70_000)), (promise) => background.push(promise), {
    freshMs: 60_000,
    staleMs: 120_000,
  });
  const response = await edge.serve('https://loop.test/expired', async () => new Response('new'));
  assert.equal(response.headers.get('x-catalog-cache'), 'MISS');
  assert.equal(await response.text(), 'new');
  assert.equal(background.length, 0);
});

test('the resizer refuses non-image content and sandboxes what it serves', async () => {
  const log: CacheLog = { puts: [], deletes: [] };
  globalThis.caches = { default: fakeCache(undefined, log) } as unknown as CacheStorage;
  const request = new Request(`https://loop.test/api/catalog/image?src=${encodeURIComponent(s3)}&w=256`);
  const context = { request, env, waitUntil: () => undefined };

  globalThis.fetch = (async () => new Response('<script>', { headers: { 'content-type': 'text/html' } })) as typeof fetch;
  const html = await serveImage(context);
  assert.equal(html.status, 415);
  assert.equal(html.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await html.text(), '');
  assert.equal(log.puts.length, 0);

  globalThis.fetch = (async () => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } })) as typeof fetch;
  const svg = await serveImage(context);
  assert.equal(svg.status, 200);
  assert.equal(svg.headers.get('content-type'), 'image/svg+xml');
  assert.equal(svg.headers.get('content-security-policy'), "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  assert.equal(svg.headers.get('content-disposition'), 'inline');
  assert.equal(svg.headers.get('x-frame-options'), 'DENY');
  assert.equal(await svg.text(), '<svg/>');
  assert.equal(log.puts.length, 1);
});

test('a cached entry that is not an image is refused and evicted', async () => {
  const log: CacheLog = { puts: [], deletes: [] };
  const stored = new Response('<html>', {
    headers: { 'content-type': 'text/html', 'x-catalog-stored-at': String(Date.now()) },
  });
  globalThis.caches = { default: fakeCache(stored, log) } as unknown as CacheStorage;
  globalThis.fetch = (async () => assert.fail('a fresh cached entry is not reloaded')) as typeof fetch;
  const background: Promise<unknown>[] = [];
  const request = new Request(`https://loop.test/api/catalog/image?src=${encodeURIComponent(s3)}&w=256`);
  const response = await serveImage({ request, env, waitUntil: (promise) => background.push(promise) });
  await Promise.all(background);
  assert.equal(response.status, 415);
  assert.equal(await response.text(), '');
  assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  assert.equal(log.deletes.length, 1);
  assert.equal(log.puts.length, 0);
});
