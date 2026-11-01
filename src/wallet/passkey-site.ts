export class PasskeySite {
  static readonly loop = 'loopfinance.io';

  static forHost(hostname: string | null): string {
    if (hostname === 'localhost' || hostname?.endsWith('.localhost')) {
      return hostname;
    }
    return PasskeySite.loop;
  }
}
