import { SecurityHeaders } from '../edge/security-headers.ts';

type MiddlewareContext = {
  next(): Promise<Response>;
};

export async function onRequest({ next }: MiddlewareContext): Promise<Response> {
  return SecurityHeaders.applied(await next(), SecurityHeaders.baseline);
}
