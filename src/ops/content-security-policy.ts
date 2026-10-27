import { Rates } from '../ctx/rates.ts';
import { loopEnvironment } from '../environment.ts';
import { network } from '../stellar/network.ts';
import { base64 } from '../wallet/base64.ts';

export type BuildEnv = Readonly<Record<string, string | undefined>>;

export class ContentSecurityPolicy {
  static readonly headerName = 'Content-Security-Policy';
  private static readonly everyPath = '/*';
  private static readonly inlineScript = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;

  private readonly connectSources: string[];
  private readonly scriptHashes: string[];

  constructor(connectUrls: readonly (string | null | undefined)[], scriptHashes: readonly string[]) {
    this.connectSources = [...new Set(connectUrls.flatMap((url) => ContentSecurityPolicy.originOf(url)))];
    this.scriptHashes = [...new Set(scriptHashes)];
  }

  static async forBuild(env: BuildEnv, pages: readonly string[]): Promise<ContentSecurityPolicy> {
    const scripts = pages.flatMap((page) => ContentSecurityPolicy.inlineScripts(page));
    const hashes = await Promise.all(scripts.map((script) => ContentSecurityPolicy.hashOf(script)));
    return new ContentSecurityPolicy(
      [
        loopEnvironment.ctxApiUrl,
        env.EXPO_PUBLIC_CATALOG_URL,
        network.rpcUrl,
        network.friendbotUrl,
        Rates.source,
        env.EXPO_PUBLIC_SENTRY_DSN,
      ],
      hashes,
    );
  }

  static inlineScripts(html: string): string[] {
    return [...html.matchAll(ContentSecurityPolicy.inlineScript)]
      .map((match) => match[1])
      .filter((script) => script.length > 0);
  }

  header(): string {
    return [
      "default-src 'self'",
      ["script-src 'self'", ...this.scriptHashes].join(' '),
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      ["connect-src 'self'", ...this.connectSources].join(' '),
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ');
  }

  addTo(headers: string): string {
    const lines = headers.split('\n');
    const block = lines.indexOf(ContentSecurityPolicy.everyPath);
    if (block === -1) {
      throw new Error(`_headers has no ${ContentSecurityPolicy.everyPath} block to hold the ${ContentSecurityPolicy.headerName}`);
    }
    lines.splice(block + 1, 0, `  ${ContentSecurityPolicy.headerName}: ${this.header()}`);
    return lines.join('\n');
  }

  private static originOf(url: string | null | undefined): string[] {
    if (!url || !URL.canParse(url)) {
      return [];
    }
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? [parsed.origin] : [];
  }

  private static async hashOf(script: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(script));
    return `'sha256-${base64.encode(new Uint8Array(digest))}'`;
  }
}
