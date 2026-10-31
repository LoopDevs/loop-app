import assert from "node:assert/strict";
import { test } from "node:test";

import { CountryOption } from "./country-option.ts";
import { Profile } from "./profile.ts";

const company = {
  countries: ["US", "GB", "CA", "IE"],
  stableCurrencies: ["XLM.USDC", "XLM.GBPLOOP"],
};

function labels(profile: Profile): Record<string, string> {
  return Object.fromEntries(
    CountryOption.forProfile(profile).map((option) => [
      option.country,
      option.currencyCode,
    ]),
  );
}

test("each country pairs with its own currency when it is offered, else dollars", () => {
  const profile = Profile.fromMe({ user: { id: "u1" }, company });
  assert.deepEqual(labels(profile), {
    US: "USD",
    GB: "GBP",
    CA: "USD",
    IE: "USD",
  });
});

test("choosing a pair sends its country and cashback currency", () => {
  const profile = Profile.fromMe({ user: { id: "u1" }, company });
  const britain = CountryOption.forProfile(profile).find(
    (option) => option.country === "GB",
  );
  assert.deepEqual(britain?.choice(), {
    country: "GB",
    stableCurrency: "XLM.GBPLOOP",
  });
});

test("an account with a cashback currency pairs every country with it", () => {
  const profile = Profile.fromMe({
    user: { id: "u1", country: "GB", stableCurrency: "XLM.USDC" },
    company,
  });
  assert.deepEqual(labels(profile), {
    US: "USD",
    GB: "USD",
    CA: "USD",
    IE: "USD",
  });
  assert.deepEqual(
    CountryOption.forProfile(profile)[0].choice().stableCurrency,
    undefined,
  );
});

test("with no cashback currencies the local currency is shown", () => {
  const profile = Profile.fromMe({
    user: { id: "u1" },
    company: { countries: ["IE"], stableCurrencies: [] },
  });
  assert.deepEqual(labels(profile), { IE: "EUR" });
});

test("the suggestion follows the preferred countries, then the first option", () => {
  const options = CountryOption.forProfile(
    Profile.fromMe({ user: { id: "u1" }, company }),
  );
  assert.equal(
    CountryOption.suggested(options, [undefined, "GB"])?.country,
    "GB",
  );
  assert.equal(
    CountryOption.suggested(options, ["FR"])?.country,
    options[0].country,
  );
});

test("search matches the country name, code or currency", () => {
  const options = CountryOption.forProfile(
    Profile.fromMe({ user: { id: "u1" }, company }),
  );
  const britain = options.find((option) => option.country === "GB");
  assert.ok(britain?.matches("king"));
  assert.ok(britain?.matches("gb"));
  assert.ok(britain?.matches("GBP"));
  assert.equal(britain?.matches("canada"), false);
});
