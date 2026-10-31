import assert from "node:assert/strict";
import test from "node:test";

import { SocketEvent } from "./socket-event.ts";

test("parses event messages and rejects everything else", () => {
  const event = SocketEvent.parse(
    JSON.stringify({ type: "event", topic: "account", data: { id: "a" } }),
  );
  assert.equal(event?.topic, "account");
  assert.deepEqual(event?.data, { id: "a" });
  assert.equal(
    SocketEvent.parse(JSON.stringify({ type: "ok", topic: "account" })),
    null,
  );
  assert.equal(
    SocketEvent.parse(JSON.stringify({ type: "event", data: {} })),
    null,
  );
  assert.equal(
    SocketEvent.parse(JSON.stringify({ type: "event", topic: 7 })),
    null,
  );
  assert.equal(SocketEvent.parse("not json"), null);
  assert.equal(SocketEvent.parse("null"), null);
  assert.equal(SocketEvent.parse(undefined), null);
});
