type LocatedRequest = Request & { cf?: { country?: unknown } };

export class VisitorRegion {
  static country(request: LocatedRequest): string | null {
    const country = request.cf?.country ?? request.headers.get("cf-ipcountry");
    return typeof country === "string" && /^[A-Z]{2}$/.test(country)
      ? country
      : null;
  }
}

export function serveRegion({ request }: { request: Request }): Response {
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: { allow: "GET" } });
  }
  return Response.json(
    { country: VisitorRegion.country(request) },
    { headers: { "cache-control": "private, no-store" } },
  );
}
