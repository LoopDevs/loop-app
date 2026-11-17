import type { GiftCard } from './client.ts';

type PaidCard = Pick<GiftCard, 'paymentCryptoCurrency' | 'paymentCryptoAddress' | 'paymentUrls'>;

export class StellarPayLink {
  static readonly scheme = 'web+stellar:pay?';
  private static readonly account = /^[GM][A-Z2-7]{55,68}$/;

  readonly uri: string | null;
  readonly destination: string;
  readonly memo: string | null;

  private constructor(uri: string | null, destination: string, memo: string | null) {
    this.uri = uri;
    this.destination = destination;
    this.memo = memo;
  }

  static of(card: PaidCard): StellarPayLink | null {
    const linked = StellarPayLink.fromUri(card.paymentUrls?.[card.paymentCryptoCurrency ?? '']);
    if (linked) {
      return linked;
    }
    const address = card.paymentCryptoAddress;
    return address && StellarPayLink.account.test(address) ? new StellarPayLink(null, address, null) : null;
  }

  private static fromUri(uri: unknown): StellarPayLink | null {
    if (typeof uri !== 'string' || !uri.startsWith(StellarPayLink.scheme)) {
      return null;
    }
    const params = new URLSearchParams(uri.slice(StellarPayLink.scheme.length));
    const destination = params.get('destination');
    if (!destination || !StellarPayLink.account.test(destination)) {
      return null;
    }
    return new StellarPayLink(uri, destination, params.get('memo'));
  }
}
