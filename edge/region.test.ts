import assert from "node:assert/strict";
import { test } from "node:test";

import { serveRegion, VisitorRegion } from "./region.ts";

function located(country: unknown, header?: string): Request {
  const request = new Request("https://loop.test/api/region", {
    headers: header ? { "cf-ipcountry": header } : {},
  });
  return Object.assign(request, { cf: { country } });
}

test("the visitor country comes from Cloudflare", () => {
  assert.equal(VisitorRegion.country(located("GB")), "GB");
  assert.equal(VisitorRegion.country(located(undefined, "FR")), "FR");
});

test("unknown and malformed countries are not reported", () => {
  assert.equal(VisitorRegion.country(located(undefined)), null);
  assert.equal(VisitorRegion.country(located("XX1")), null);
  assert.equal(VisitorRegion.country(located(undefined, "gb")), null);
});

test("the region answer is never cached", async () => {
  const response = serveRegion({ request: located("US") });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), { country: "US" });
});
