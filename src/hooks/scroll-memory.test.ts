import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ScrollMemory } from './scroll-memory.ts';

const stack = (index: number) => ({ type: 'stack', index });
const tab = (index: number) => ({ type: 'tab', index });

test('a screen pushed on top of a stack screen covers it', () => {
  assert.equal(ScrollMemory.coveredBy(stack(0), stack(1)), true);
  assert.equal(ScrollMemory.coveredBy(stack(1), stack(3)), true);
});

test('a tab switch, a pop and an unchanged stack leave the screen uncovered', () => {
  assert.equal(ScrollMemory.coveredBy(tab(0), tab(1)), false);
  assert.equal(ScrollMemory.coveredBy(stack(0), stack(0)), false);
  assert.equal(ScrollMemory.coveredBy(stack(1), stack(0)), false);
  assert.equal(ScrollMemory.coveredBy(undefined, stack(1)), false);
  assert.equal(ScrollMemory.coveredBy(stack(0), undefined), false);
});

test('a first visit starts at the top', () => {
  assert.equal(new ScrollMemory().arrive(), null);
});

test('returning from a covering screen lands on the offset the user left at, once', () => {
  const memory = new ScrollMemory();
  memory.leave(true, 420);
  assert.equal(memory.arrive(), 420);
  assert.equal(memory.arrive(), null);
});

test('leaving by a tab switch forgets the offset', () => {
  const memory = new ScrollMemory();
  memory.leave(false, 420);
  assert.equal(memory.arrive(), null);
});

test('a covered screen with no offset reading starts at the top', () => {
  const memory = new ScrollMemory();
  memory.leave(true, null);
  assert.equal(memory.arrive(), null);
});
