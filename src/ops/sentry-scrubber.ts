import type { Breadcrumb, ErrorEvent } from '@sentry/react-native';

type Bag = Record<string, unknown>;

const FILTERED = '[Filtered]';

const STATIC_ROUTE_WORDS = new Set([
  'users',
  'gift-cards',
  'merchants',
  'wallets',
  'stellar',
  'sponsor',
  'transaction',
  'deploy',
  'me',
  'status',
  'login',
  'oauth',
  'logout',
  'verify-email',
  'refresh-token',
  'shop',
  'wallet',
  'cash-out',
  'cashback',
  'savings',
  'profile',
  'settings',
  'about',
  'accessibility',
  'affiliates',
  'careers',
  'complaints',
  'cookies',
  'faq',
  'how-it-works',
  'press',
  'privacy',
  'security',
  'support',
  'terms',
]);

const SAFE_EXTRA_KEYS = new Set(['componentStack']);

const SAFE_CONTEXT_KEYS = new Set(['app', 'os', 'runtime', 'culture', 'device']);

const SAFE_BREADCRUMB_KEYS = new Set(['method', 'status_code', 'url', 'from', 'to']);

const SAFE_FRAME_KEYS = new Set([
  'filename',
  'function',
  'module',
  'platform',
  'lineno',
  'colno',
  'abs_path',
  'context_line',
  'pre_context',
  'post_context',
  'in_app',
  'instruction_addr',
  'addr_mode',
  'debug_id',
]);

const SAFE_MECHANISM_KEYS = new Set([
  'type',
  'handled',
  'synthetic',
  'source',
  'is_exception_group',
  'exception_id',
  'parent_id',
]);

type ExceptionEntry = NonNullable<NonNullable<ErrorEvent['exception']>['values']>[number];

type Stacktrace = NonNullable<ExceptionEntry['stacktrace']>;

const SENSITIVE_FIELDS =
  'access_?token|refresh_?token|id_?token|identity_?token|token|authorization|password|secret|seed|mnemonic|private_?key|pin|number|redeem_?url|barcode_?url|code|otp|email|signature|xdr|transaction';

const FIELD_PAIR = new RegExp(`(["']?(?:\\b|(?<=[a-z]))(?:${SENSITIVE_FIELDS})["']?\\s*[:=]\\s*)("[^"]*"|'[^']*'|[^\\s,;&}]+)`, 'gi');

const PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g,
  /\bS[A-Z2-7]{55}\b/g,
  /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,63}/g,
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi,
  /\b[A-Fa-f0-9]{32,}\b/g,
  /[A-Za-z0-9+/_-]{40,}={0,2}/g,
];

const CTX_ERROR_MESSAGE = /CTX (\d{3}):[\s\S]*$/;

const MAX_SCRUBBED_LENGTH = 4096;

export class SentryScrubber {
  static scrubString(value: string): string {
    let scrubbed = SentryScrubber.bounded(value).replace(CTX_ERROR_MESSAGE, 'CTX $1');
    for (const pattern of PATTERNS) {
      scrubbed = scrubbed.replace(pattern, FILTERED);
    }
    return scrubbed.replace(FIELD_PAIR, `$1${FILTERED}`);
  }

  static routeTemplate(url: string): string {
    const path = url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i, '').split(/[?#]/)[0] ?? '';
    const segments = path.split('/').map((segment) => {
      if (segment === '' || STATIC_ROUTE_WORDS.has(segment)) {
        return segment;
      }
      return ':id';
    });
    return segments.join('/') || '/';
  }

  static scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
    const scrubbed: Breadcrumb = { ...breadcrumb };
    if (typeof scrubbed.message === 'string') {
      scrubbed.message = SentryScrubber.scrubString(scrubbed.message);
    }
    if (scrubbed.data) {
      scrubbed.data = SentryScrubber.breadcrumbData(scrubbed.data);
    }
    return scrubbed;
  }

  static scrubEvent(event: ErrorEvent): ErrorEvent {
    const scrubbed: ErrorEvent = { ...event };
    delete scrubbed.user;
    delete scrubbed.server_name;
    delete scrubbed.transaction;
    delete scrubbed.modules;
    if (typeof scrubbed.message === 'string') {
      scrubbed.message = SentryScrubber.scrubString(scrubbed.message);
    }
    if (scrubbed.logentry) {
      scrubbed.logentry = {
        ...scrubbed.logentry,
        message: scrubbed.logentry.message && SentryScrubber.scrubString(scrubbed.logentry.message),
        params: undefined,
      };
    }
    if (scrubbed.exception?.values) {
      scrubbed.exception = {
        ...scrubbed.exception,
        values: scrubbed.exception.values.map((entry) => ({
          ...entry,
          value: entry.value === undefined ? undefined : SentryScrubber.scrubString(entry.value),
          stacktrace: entry.stacktrace && SentryScrubber.stacktrace(entry.stacktrace),
          mechanism: entry.mechanism && (SentryScrubber.allowKeys(entry.mechanism, SAFE_MECHANISM_KEYS) as ExceptionEntry['mechanism']),
        })),
      };
    }
    if (scrubbed.threads?.values) {
      scrubbed.threads = {
        ...scrubbed.threads,
        values: scrubbed.threads.values.map((thread) => ({
          ...thread,
          stacktrace: thread.stacktrace && SentryScrubber.stacktrace(thread.stacktrace),
        })),
      };
    }
    if (scrubbed.fingerprint) {
      scrubbed.fingerprint = scrubbed.fingerprint.map((part) => SentryScrubber.scrubString(part));
    }
    if (scrubbed.request) {
      const { method, url } = scrubbed.request;
      scrubbed.request = {
        ...(method ? { method } : {}),
        ...(url ? { url: SentryScrubber.routeTemplate(url) } : {}),
      };
    }
    if (scrubbed.breadcrumbs) {
      scrubbed.breadcrumbs = scrubbed.breadcrumbs.map((entry) => SentryScrubber.scrubBreadcrumb(entry));
    }
    if (scrubbed.extra) {
      scrubbed.extra = SentryScrubber.stringValues(SentryScrubber.allowKeys(scrubbed.extra, SAFE_EXTRA_KEYS));
    }
    if (scrubbed.contexts) {
      scrubbed.contexts = SentryScrubber.contexts(scrubbed.contexts);
    }
    if (scrubbed.tags) {
      scrubbed.tags = SentryScrubber.stringValues(scrubbed.tags) as typeof scrubbed.tags;
    }
    return scrubbed;
  }

  private static bounded(value: string): string {
    if (value.length <= MAX_SCRUBBED_LENGTH) {
      return value;
    }
    let end = MAX_SCRUBBED_LENGTH;
    while (end > 0 && !/\s/.test(value.charAt(end - 1))) {
      end--;
    }
    return `${value.slice(0, end)}${FILTERED}`;
  }

  private static breadcrumbData(data: Bag): Bag {
    const kept = SentryScrubber.allowKeys(data, SAFE_BREADCRUMB_KEYS);
    if (typeof kept.url === 'string') {
      kept.url = SentryScrubber.routeTemplate(kept.url);
    }
    for (const key of ['from', 'to']) {
      const route = kept[key];
      if (typeof route === 'string') {
        kept[key] = SentryScrubber.routeTemplate(route);
      }
    }
    return kept;
  }

  private static stacktrace(stacktrace: Stacktrace): Stacktrace {
    if (!stacktrace.frames) {
      return stacktrace;
    }
    return {
      ...stacktrace,
      frames: stacktrace.frames.map((frame) => SentryScrubber.allowKeys(frame, SAFE_FRAME_KEYS)),
    };
  }

  private static contexts(contexts: Bag): ErrorEvent['contexts'] {
    const kept = SentryScrubber.allowKeys(contexts, SAFE_CONTEXT_KEYS);
    const device = kept.device;
    if (device && typeof device === 'object') {
      const { name: _name, ...rest } = device as Bag;
      kept.device = rest;
    }
    return kept as ErrorEvent['contexts'];
  }

  private static allowKeys<T extends object>(source: T, allowed: Set<string>): Partial<T> {
    const kept: Bag = {};
    for (const [key, value] of Object.entries(source)) {
      if (allowed.has(key)) {
        kept[key] = value;
      }
    }
    return kept as Partial<T>;
  }

  private static stringValues(source: Bag): Bag {
    const scrubbed: Bag = {};
    for (const key of Object.keys(source)) {
      const value = source[key];
      scrubbed[key] = typeof value === 'string' ? SentryScrubber.scrubString(value) : value;
    }
    return scrubbed;
  }
}
