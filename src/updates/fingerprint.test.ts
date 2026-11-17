import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

type FingerprintSource = { type: string; id?: string; filePath?: string };
type Fingerprint = { sources: FingerprintSource[] };

const { createFingerprintAsync } = createRequire(import.meta.url)('@expo/fingerprint') as {
  createFingerprintAsync(projectRoot: string): Promise<Fingerprint>;
};

test('the update runtime fingerprint hashes native inputs only', async () => {
  const { sources } = await createFingerprintAsync(process.cwd());
  const hashed = sources.map((source) => source.filePath ?? source.id ?? '');
  assert.ok(hashed.includes('expoConfig'));
  assert.deepEqual(
    hashed.filter((name) => name.startsWith('src/') || name === '.gitignore' || name === 'packageJson:scripts'),
    [],
  );
});
