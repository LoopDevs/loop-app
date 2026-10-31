import assert from "node:assert/strict";
import { test } from "node:test";

import { Market } from "./market.ts";

test("a supported chosen country wins over location and locale", () => {
  assert.equal(Market.resolve("GB", "FR", ["en-US"]), "GB");
});

test("the located country wins over the locale", () => {
  assert.equal(Market.resolve(null, "IE", ["en-US"]), "IE");
});

test("an unsupported chosen or located country falls through to the locale region", () => {
  assert.equal(Market.resolve("JP", "JP", ["fr-FR"]), "FR");
});

test("the first supported locale region is used", () => {
  assert.equal(Market.resolve(null, null, ["ja-JP", "en-CA"]), "CA");
});

test("script subtags and underscores are read", () => {
  assert.equal(Market.regionOf("zh-Hant-TW"), "TW");
  assert.equal(Market.regionOf("en_gb"), "GB");
});

test("a locale without a region gives no region", () => {
  assert.equal(Market.regionOf("en"), undefined);
  assert.equal(Market.regionOf(undefined), undefined);
});

test("no supported choice, location or locale gives the fallback market", () => {
  assert.equal(
    Market.resolve(undefined, undefined, ["en", "ja-JP", undefined]),
    Market.fallback,
  );
});

test("each market has its local currency", () => {
  assert.equal(Market.localCurrency("GB"), "GBP");
  assert.equal(Market.localCurrency("US"), "USD");
  assert.equal(Market.localCurrency("CA"), "CAD");
  assert.equal(Market.localCurrency("IE"), "EUR");
});
