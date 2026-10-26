import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CatalogImage, CatalogPage, CatalogQuery, EdgeCache } from './catalog.ts';

const s3 = 'https://ctx-spend.s3.us-west-2.amazonaws.com/0/abc';

test('only whitelisted catalogue params reach CTX, in a stable order', () => {
  const query = CatalogQuery.from(
    new URL('https://loop.test/api/catalog/merchants?perPage=24&country=US&token=x&userId=1&enabled=1&order=-discount,name'),
  );
  assert.equal(query.upstreamUrl('https://ctx.test'), 'https://ctx.test/merchants?country=US&enabled=1&order=-discount%2Cname&perPage=24');
});

test('the same query in any param order shares one cache key', () => {
  const a = CatalogQuery.from(new URL('https://loop.test/x?country=GB&slug=tesco'));
  const b = CatalogQuery.from(new URL('https://loop.test/x?slug=tesco&country=GB&utm=1'));
  assert.equal(a.cacheKey('https://loop.test'), b.cacheKey('https://loop.test'));
});

test('oversized param values are dropped', () => {
  const query = CatalogQuery.from(new URL(`https://loop.test/x?country=US&name=${'a'.repeat(600)}`));
  assert.equal(query.upstreamUrl('https://ctx.test'), 'https://ctx.test/merchants?country=US');
});

test('images resize only from the CTX bucket at the catalogue widths', () => {
  assert.ok(CatalogImage.from(new URL(`https://loop.test/i?src=${encodeURIComponent(s3)}&w=256`)));
  assert.equal(CatalogImage.from(new URL(`https://loop.test/i?src=${encodeURIComponent(s3)}&w=300`)), null);
  assert.equal(CatalogImage.from(new URL('https://loop.test/i?src=https%3A%2F%2Fevil.test%2Fa.png&w=256')), null);
  assert.equal(
    CatalogImage.from(new URL(`https://loop.test/i?src=${encodeURIComponent('https://ctx-spend.s3.us-west-2.amazonaws.com.evil.test/a')}&w=256`)),
    null,
  );
});

test('catalogue pages point CTX images at the edge resizer and leave others alone', () => {
  const page = JSON.parse(
    CatalogPage.withEdgeImages(JSON.stringify({ result: [{ logoUrl: s3, cardImageUrl: 'https://other.test/c.png' }] })),
  );
  assert.equal(page.result[0].logoUrl, `/api/catalog/image?src=${encodeURIComponent(s3)}&w=256`);
  assert.equal(page.result[0].cardImageUrl, 'https://other.test/c.png');
});

test('an empty catalogue page stays empty', () => {
  assert.deepEqual(JSON.parse(CatalogPage.withEdgeImages('{"result":null}')), { result: null });
});

test('the best image format follows the Accept header', () => {
  assert.equal(CatalogImage.format('image/avif,image/webp,*/*'), 'avif');
  assert.equal(CatalogImage.format('image/webp,*/*'), 'webp');
  assert.equal(CatalogImage.format(null), undefined);
});

test('cached entries are fresh only inside the freshness window', () => {
  const edge = new EdgeCache({} as Cache, () => undefined, 60_000);
  assert.equal(edge.isFresh(1_000, 60_999), true);
  assert.equal(edge.isFresh(1_000, 61_000), false);
});
