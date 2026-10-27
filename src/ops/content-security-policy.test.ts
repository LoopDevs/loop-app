import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { ContentSecurityPolicy } from './content-security-policy.ts';

const page = [
  '<html><head>',
  '<script>document.documentElement.dataset.ready="1"</script>',
  '<script defer="" src="/_expo/static/js/web/entry.js"></script>',
  '<script id="_R_">globalThis.__EXPO_ROUTER_HYDRATE__=true;</script>',
  '</head></html>',
].join('');

function directive(policy: ContentSecurityPolicy, name: string): string | undefined {
  return policy
    .header()
    .split('; ')
    .find((entry) => entry.startsWith(`${name} `));
}

function sha256(script: string): string {
  return `'sha256-${createHash('sha256').update(script).digest('base64')}'`;
}

test('the build policy lets the app reach only the services of its environment', async () => {
  const policy = await ContentSecurityPolicy.forBuild(
    { EXPO_PUBLIC_CATALOG_URL: '/api/catalog', EXPO_PUBLIC_SENTRY_DSN: 'https://key@o1.ingest.us.sentry.io/42' },
    [page],
  );

  assert.equal(
    directive(policy, 'connect-src'),
    "connect-src 'self' https://staging.spend.ctx.com https://soroban-testnet.stellar.org https://friendbot.stellar.org https://rates.ctx.com https://o1.ingest.us.sentry.io",
  );
});

test('a catalog on another origin is allowed alongside the CTX API', async () => {
  const policy = await ContentSecurityPolicy.forBuild({ EXPO_PUBLIC_CATALOG_URL: 'https://catalog.loop.test/api' }, []);

  assert.match(directive(policy, 'connect-src') ?? '', / https:\/\/catalog\.loop\.test( |$)/);
});

test('scripts run only from the site and from the inline scripts the export wrote', async () => {
  const policy = await ContentSecurityPolicy.forBuild({}, [page, page]);

  assert.equal(
    directive(policy, 'script-src'),
    [
      "script-src 'self'",
      sha256('document.documentElement.dataset.ready="1"'),
      sha256('globalThis.__EXPO_ROUTER_HYDRATE__=true;'),
    ].join(' '),
  );
});

test('the policy refuses framing, plugins and foreign form targets', () => {
  const policy = new ContentSecurityPolicy([], []);

  assert.equal(directive(policy, 'default-src'), "default-src 'self'");
  assert.equal(directive(policy, 'frame-ancestors'), "frame-ancestors 'none'");
  assert.equal(directive(policy, 'object-src'), "object-src 'none'");
  assert.equal(directive(policy, 'form-action'), "form-action 'self'");
  assert.equal(directive(policy, 'base-uri'), "base-uri 'self'");
});

test('plain http and unparsable sources are left out of connect-src', () => {
  const policy = new ContentSecurityPolicy(['http://localhost:8081', 'not a url', null, undefined], []);

  assert.equal(directive(policy, 'connect-src'), "connect-src 'self'");
});

test('the policy is added to the headers for every path', () => {
  const policy = new ContentSecurityPolicy([], []);
  const headers = ['/*', '  X-Frame-Options: DENY', '', '/assets/*', '  Cache-Control: immutable'].join('\n');

  const lines = policy.addTo(headers).split('\n');

  assert.equal(lines[0], '/*');
  assert.equal(lines[1], `  Content-Security-Policy: ${policy.header()}`);
  assert.equal(lines[2], '  X-Frame-Options: DENY');
  assert.equal(lines[4], '/assets/*');
});

test('headers without a block for every path are refused', () => {
  assert.throws(() => new ContentSecurityPolicy([], []).addTo('/assets/*\n  Cache-Control: immutable'), /no \/\* block/);
});
