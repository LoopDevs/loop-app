import type { EnvironmentName } from '../environment.ts';

export class PasskeySite {
  static readonly loop = 'loopfinance.io';

  static forHost(hostname: string | null, environment: EnvironmentName): string {
    if (hostname && environment !== 'production' && PasskeySite.isLocal(hostname)) {
      return hostname;
    }
    return PasskeySite.loop;
  }

  private static isLocal(hostname: string): boolean {
    return hostname === 'localhost' || hostname.endsWith('.localhost');
  }
}
