import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { symbolCodepoint } from './symbol-codepoints.ts';

const srcDir = join(import.meta.dirname, '..');

function webSymbolNames(): string[] {
  const files = readdirSync(srcDir, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.tsx'));
  const names = files.flatMap((file) =>
    [...readFileSync(join(srcDir, file), 'utf8').matchAll(/web: ['"]([a-z_]+)['"]/g)].map((match) => match[1]),
  );
  return [...new Set(names)];
}

test('every web symbol used in the app has a glyph in the Loop symbol font', () => {
  const names = webSymbolNames();
  assert.ok(names.length > 0);
  const missing = names.filter((name) => symbolCodepoint({ ios: 'circle', android: 'circle', web: name } as never) === undefined);
  assert.deepEqual(missing, []);
});

test('a symbol without a web name has no codepoint', () => {
  assert.equal(symbolCodepoint('circle' as never), undefined);
});
