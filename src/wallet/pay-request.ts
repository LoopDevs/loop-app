import { network } from '../stellar/network.ts';

export class PayRequest {
  static readonly scheme = 'web+stellar:pay';
  static readonly assetCode = 'USDC';

  readonly destination: string;
  readonly amount: string | null;

  constructor(destination: string, amount: string | null = null) {
    this.destination = destination;
    this.amount = amount;
  }

  uri(): string {
    const params = new URLSearchParams({ destination: this.destination });
    if (this.amount !== null) {
      params.set('amount', this.amount);
    }
    params.set('asset_code', PayRequest.assetCode);
    params.set('asset_issuer', network.usdcIssuer);
    return `${PayRequest.scheme}?${params.toString()}`;
  }
}
