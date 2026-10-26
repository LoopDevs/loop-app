import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const listing = JSON.parse(readFileSync("store/listing.json", "utf8"));
const app = JSON.parse(readFileSync("app.json", "utf8")).expo;

const limits: [string, string, number][] = [
  ["ios", "name", 30],
  ["ios", "subtitle", 30],
  ["ios", "keywords", 100],
  ["ios", "promotionalText", 170],
  ["ios", "description", 4000],
  ["ios", "whatsNew", 4000],
  ["play", "title", 30],
  ["play", "shortDescription", 80],
  ["play", "fullDescription", 4000],
];

for (const [store, field, max] of limits) {
  test(`${store}.${field} fits ${max} characters`, () => {
    const length = listing[store][field].length;
    assert.ok(length <= max, `${store}.${field} is ${length}`);
  });
}

test("listing copy avoids retired product wording", () => {
  const banned =
    /discount|sep-?7|non-custodial|tranche|\bmap\b|cannot move|can't move/i;
  assert.doesNotMatch(
    JSON.stringify({ ...listing, privacy: undefined }),
    banned,
  );
});

test("custody is described with the custody sentence", () => {
  const texts = [
    listing.ios.description,
    listing.play.fullDescription,
    listing.review.notes,
  ];
  for (const text of texts) {
    assert.ok(text.includes(listing.custodySentence));
  }
});

test("privacy answers match the iOS privacy manifest", () => {
  const manifest = app.ios.privacyManifests.NSPrivacyCollectedDataTypes.map(
    (entry: { NSPrivacyCollectedDataType: string }) =>
      entry.NSPrivacyCollectedDataType,
  );
  const listed = listing.privacy.collected.map(
    (entry: { ios: string }) => entry.ios,
  );
  assert.deepEqual([...listed].sort(), [...manifest].sort());
});

test("listing identifiers match app.json", () => {
  assert.equal(listing.ios.bundleId, app.ios.bundleIdentifier);
  assert.equal(listing.ios.name, app.name);
  assert.equal(listing.screenshots.ios.ipad, app.ios.supportsTablet === true);
});
