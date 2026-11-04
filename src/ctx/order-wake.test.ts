import assert from "node:assert/strict";
import test from "node:test";

import { maxPollIntervalMs, pollIntervalMs } from "./gift-card-status.ts";
import { OrderWake } from "./order-wake.ts";

const event = (id: string, topic = "giftcard", type = "event") =>
  JSON.stringify({ type, topic, data: { id } });

test("only giftcard events for the followed order wake it", () => {
  assert.equal(OrderWake.concerns(event("a"), "a"), true);
  assert.equal(OrderWake.concerns(event("b"), "a"), false);
  assert.equal(OrderWake.concerns(event("a", "merchant"), "a"), false);
  assert.equal(OrderWake.concerns(event("a", "giftcard", "ok"), "a"), false);
  assert.equal(OrderWake.concerns("not json", "a"), false);
  assert.equal(OrderWake.concerns("null", "a"), false);
  assert.equal(
    OrderWake.concerns(
      JSON.stringify({ type: "event", topic: "giftcard", data: null }),
      "a",
    ),
    false,
  );
  assert.equal(OrderWake.concerns(undefined, "a"), false);
});

test("a signal ends a wait early", async () => {
  const wake = new OrderWake();
  const started = Date.now();
  const waiting = wake.wait(5000);
  wake.signal();
  await waiting;
  assert.ok(Date.now() - started < 1000);
});

test("a signal sent before the wait is not lost", async () => {
  const wake = new OrderWake();
  wake.signal();
  const started = Date.now();
  await wake.wait(5000);
  assert.ok(Date.now() - started < 1000);
});

test("a wait with no signal ends at the timeout and the next wait waits again", async () => {
  const wake = new OrderWake();
  await wake.wait(10);
  const started = Date.now();
  await wake.wait(40);
  assert.ok(Date.now() - started >= 30);
});

test("an attached wake polls at the heartbeat and a detached one at the fast cadence", () => {
  const wake = new OrderWake();
  assert.equal(wake.interval(), pollIntervalMs);
  wake.attach();
  assert.equal(wake.interval(), maxPollIntervalMs);
  wake.detach();
  assert.equal(wake.interval(), pollIntervalMs);
});

test("detaching ends a pending wait", async () => {
  const wake = new OrderWake();
  wake.attach();
  const started = Date.now();
  const waiting = wake.wait(5000);
  wake.detach();
  await waiting;
  assert.ok(Date.now() - started < 1000);
});
