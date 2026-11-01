export class SecurityHeaders {
  static readonly baseline: Readonly<Record<string, string>> = {
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  };

  static readonly image: Readonly<Record<string, string>> = {
    ...SecurityHeaders.baseline,
    'content-disposition': 'inline',
  };

  static applied(response: Response, headers: Readonly<Record<string, string>>): Response {
    const secured = new Response(response.body, response);
    for (const [name, value] of Object.entries(headers)) {
      secured.headers.set(name, value);
    }
    return secured;
  }
}
