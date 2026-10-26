import assert from "node:assert/strict";
import test from "node:test";

import { BuyTimer } from "./buy-timer.ts";

test("each step logs the milliseconds since the timer started", () => {
  let clock = 1000;
  const lines: string[] = [];
  const timer = new BuyTimer(
    () => clock,
    (line) => lines.push(line),
  );
  clock = 1120;
  timer.mark("order created");
  clock = 1900;
  timer.mark("signed");
  assert.deepEqual(lines, [
    "[buy] order created +120ms",
    "[buy] signed +900ms",
  ]);
});
