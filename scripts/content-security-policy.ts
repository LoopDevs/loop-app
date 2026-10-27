import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { loadProjectEnv } from '@expo/env';

const dist = process.argv[2] ?? 'dist';
loadProjectEnv(process.cwd(), { mode: 'production', silent: true });
const { ContentSecurityPolicy } = await import('../src/ops/content-security-policy.ts');

const files = await readdir(dist, { recursive: true });
const pages = await Promise.all(
  files.filter((file) => file.endsWith('.html')).map((file) => readFile(path.join(dist, file), 'utf8')),
);
const policy = await ContentSecurityPolicy.forBuild(process.env, pages);
const headersFile = path.join(dist, '_headers');
await writeFile(headersFile, policy.addTo(await readFile(headersFile, 'utf8')));
console.log(`${ContentSecurityPolicy.headerName}: ${policy.header()}`);
