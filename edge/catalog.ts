export type CatalogEnv = {
  CTX_API_URL: string;
  CTX_CLIENT_ID: string;
};

export type EdgeContext = {
  request: Request;
  env: CatalogEnv;
  waitUntil(promise: Promise<unknown>): void;
};

type ImageFetchInit = RequestInit & {
  cf: { image: { width: number; fit: 'scale-down'; format?: 'avif' | 'webp' } };
};

type MerchantJson = Record<string, unknown> & { logoUrl?: string; cardImageUrl?: string };

const storedAtHeader = 'x-catalog-stored-at';

export class CatalogQuery {
  static readonly allowedParams = ['enabled', 'order', 'country', 'name', 'ids', 'category', 'page', 'perPage', 'slug'];
  static readonly maxValueLength = 512;

  readonly params: URLSearchParams;

  private constructor(params: URLSearchParams) {
    this.params = params;
  }

  static from(url: URL): CatalogQuery {
    const params = new URLSearchParams();
    for (const name of CatalogQuery.allowedParams) {
      const value = url.searchParams.get(name);
      if (value !== null && value.length <= CatalogQuery.maxValueLength) {
        params.set(name, value);
      }
    }
    params.sort();
    return new CatalogQuery(params);
  }

  upstreamUrl(ctxApiUrl: string): string {
    return `${ctxApiUrl}/merchants?${this.params}`;
  }

  cacheKey(origin: string): string {
    return `${origin}/api/catalog/merchants?${this.params}`;
  }
}

export class CatalogImage {
  static readonly source = 'https://ctx-spend.s3.us-west-2.amazonaws.com/';
  static readonly widths = { logo: 256, card: 960 } as const;
  static readonly path = '/api/catalog/image';

  readonly src: string;
  readonly width: number;

  private constructor(src: string, width: number) {
    this.src = src;
    this.width = width;
  }

  static from(url: URL): CatalogImage | null {
    const src = url.searchParams.get('src') ?? '';
    const width = Number(url.searchParams.get('w'));
    const widths: readonly number[] = Object.values(CatalogImage.widths);
    if (!src.startsWith(CatalogImage.source) || src.includes('..') || !widths.includes(width)) {
      return null;
    }
    return new CatalogImage(src, width);
  }

  static url(src: string | undefined, width: number): string | undefined {
    if (!src?.startsWith(CatalogImage.source)) {
      return src;
    }
    return `${CatalogImage.path}?${new URLSearchParams({ src, w: String(width) })}`;
  }

  static format(accept: string | null): 'avif' | 'webp' | undefined {
    if (accept?.includes('image/avif')) {
      return 'avif';
    }
    if (accept?.includes('image/webp')) {
      return 'webp';
    }
    return undefined;
  }

  cacheKey(origin: string, format: string | undefined): string {
    return `${origin}${CatalogImage.path}?${new URLSearchParams({ src: this.src, w: String(this.width), f: format ?? 'original' })}`;
  }

  fetchInit(format: 'avif' | 'webp' | undefined): ImageFetchInit {
    return { cf: { image: { width: this.width, fit: 'scale-down', ...(format ? { format } : {}) } } };
  }
}

export class CatalogPage {
  static withEdgeImages(body: string): string {
    const page = JSON.parse(body) as { result?: MerchantJson[] | null };
    for (const merchant of page.result ?? []) {
      merchant.logoUrl = CatalogImage.url(merchant.logoUrl, CatalogImage.widths.logo);
      merchant.cardImageUrl = CatalogImage.url(merchant.cardImageUrl, CatalogImage.widths.card);
    }
    return JSON.stringify(page);
  }
}

export class EdgeCache {
  static readonly catalogFreshMs = 60_000;
  static readonly imageFreshMs = 24 * 60 * 60_000;
  static readonly keepSeconds = 7 * 24 * 60 * 60;
  static readonly browserCacheControl = 'public, max-age=30, stale-while-revalidate=600';
  private static readonly refreshing = new Map<string, Promise<Response>>();

  private readonly cache: Cache;
  private readonly waitUntil: (promise: Promise<unknown>) => void;
  private readonly freshMs: number;

  constructor(cache: Cache, waitUntil: (promise: Promise<unknown>) => void, freshMs: number) {
    this.cache = cache;
    this.waitUntil = waitUntil;
    this.freshMs = freshMs;
  }

  static default(): Cache {
    return (caches as unknown as { default: Cache }).default;
  }

  isFresh(storedAt: number, now: number): boolean {
    return now - storedAt < this.freshMs;
  }

  async serve(key: string, load: () => Promise<Response>): Promise<Response> {
    const cached = await this.cache.match(key);
    if (!cached) {
      return EdgeCache.toClient(await this.refresh(key, load), 'MISS');
    }
    const storedAt = Number(cached.headers.get(storedAtHeader));
    if (this.isFresh(storedAt, Date.now())) {
      return EdgeCache.toClient(cached, 'HIT');
    }
    this.waitUntil(this.refresh(key, load).catch(() => undefined));
    return EdgeCache.toClient(cached, 'STALE');
  }

  private refresh(key: string, load: () => Promise<Response>): Promise<Response> {
    const pending = EdgeCache.refreshing.get(key);
    if (pending) {
      return pending.then((response) => response.clone());
    }
    const request = this.store(key, load).finally(() => EdgeCache.refreshing.delete(key));
    EdgeCache.refreshing.set(key, request);
    return request.then((response) => response.clone());
  }

  private async store(key: string, load: () => Promise<Response>): Promise<Response> {
    const loaded = await load();
    if (!loaded.ok) {
      return new Response(loaded.body, {
        status: loaded.status,
        headers: { 'content-type': loaded.headers.get('content-type') ?? 'text/plain', 'cache-control': 'no-store' },
      });
    }
    const stored = new Response(await loaded.arrayBuffer(), {
      headers: {
        'content-type': loaded.headers.get('content-type') ?? 'application/octet-stream',
        'cache-control': `public, max-age=${EdgeCache.keepSeconds}`,
        [storedAtHeader]: String(Date.now()),
      },
    });
    await this.cache.put(key, stored.clone());
    return stored;
  }

  private static toClient(response: Response, state: 'HIT' | 'STALE' | 'MISS'): Response {
    if (!response.ok) {
      return response;
    }
    const headers = new Headers({
      'content-type': response.headers.get('content-type') ?? 'application/octet-stream',
      'cache-control': EdgeCache.browserCacheControl,
      'x-catalog-cache': state,
    });
    const storedAt = Number(response.headers.get(storedAtHeader));
    if (storedAt) {
      headers.set('age', String(Math.max(0, Math.floor((Date.now() - storedAt) / 1000))));
    }
    return new Response(response.body, { status: response.status, headers });
  }
}

export async function serveMerchants({ request, env, waitUntil }: EdgeContext): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response(null, { status: 405, headers: { allow: 'GET' } });
  }
  const url = new URL(request.url);
  const query = CatalogQuery.from(url);
  const edge = new EdgeCache(EdgeCache.default(), waitUntil, EdgeCache.catalogFreshMs);
  return edge.serve(query.cacheKey(url.origin), async () => {
    const upstream = await fetch(query.upstreamUrl(env.CTX_API_URL), {
      headers: { accept: 'application/json', 'x-client-id': env.CTX_CLIENT_ID },
    });
    if (!upstream.ok) {
      return upstream;
    }
    return new Response(CatalogPage.withEdgeImages(await upstream.text()), {
      headers: { 'content-type': 'application/json; charset=UTF-8' },
    });
  });
}

export async function serveImage({ request, waitUntil }: EdgeContext): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response(null, { status: 405, headers: { allow: 'GET' } });
  }
  const url = new URL(request.url);
  const image = CatalogImage.from(url);
  if (!image) {
    return new Response('Unsupported image', { status: 400 });
  }
  const format = CatalogImage.format(request.headers.get('accept'));
  const edge = new EdgeCache(EdgeCache.default(), waitUntil, EdgeCache.imageFreshMs);
  const response = await edge.serve(image.cacheKey(url.origin, format), async () => {
    const resized = await fetch(image.src, image.fetchInit(format) as RequestInit);
    return resized.ok ? resized : fetch(image.src);
  });
  if (response.ok) {
    response.headers.set('cache-control', 'public, max-age=604800, stale-while-revalidate=2592000');
    response.headers.set('vary', 'Accept');
  }
  return response;
}
