import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { symbolCodepoint } from './symbol-codepoints.ts';

const srcDir = join(import.meta.dirname, '..');

function webNamesIn(source: string): string[] {
  return [...source.matchAll(/\bweb:\s*([^\n,}]+)/g)].flatMap((value) =>
    [...value[1].matchAll(/['"]([a-z_]+)['"]/g)].map((name) => name[1]),
  );
}

function webSymbolNames(): string[] {
  const files = readdirSync(srcDir, { recursive: true, encoding: 'utf8' }).filter(
    (file) => /\.tsx?$/.test(file) && !file.endsWith('.test.ts'),
  );
  const names = files.flatMap((file) => webNamesIn(readFileSync(join(srcDir, file), 'utf8')));
  return [...new Set(names)];
}

test('web names are read from literals, conditionals and values on the next line', () => {
  assert.deepEqual(webNamesIn("{ ios: 'a', web: 'one_x' }"), ['one_x']);
  assert.deepEqual(webNamesIn("{ web: saved ? 'two_x' : 'three_x', other: 1 }"), ['two_x', 'three_x']);
  assert.deepEqual(webNamesIn("{\n  web:\n    'four_x',\n}"), ['four_x']);
});

test('every web symbol used in the app has a glyph in the Loop symbol font', () => {
  const names = webSymbolNames();
  assert.ok(names.length > 0);
  const missing = names.filter((name) => symbolCodepoint({ ios: 'circle', android: 'circle', web: name } as never) === undefined);
  assert.deepEqual(missing, []);
});

test('a symbol without a web name has no codepoint', () => {
  assert.equal(symbolCodepoint('circle' as never), undefined);
});
