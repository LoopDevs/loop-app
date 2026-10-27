import { stablePeg, type PaymentCurrency } from '../stellar/network.ts';
import { units } from '../stellar/units.ts';
import { Deadline } from './deadline.ts';

export class Rates {
  static readonly source = 'https://rates.ctx.com/rates';
  static readonly preferredQuoteSource = 'ctx';
  static readonly usd = 'USD';
  static readonly one = units.parse('1');

  private readonly usdPrices: ReadonlyMap<string, bigint>;

  constructor(usdPrices: ReadonlyMap<string, bigint>) {
    this.usdPrices = usdPrices;
  }

  static fromPrices(prices: Record<string, string | null>): Rates {
    const parsed = new Map<string, bigint>();
    for (const [currency, price] of Object.entries(prices)) {
      const value = price === null ? null : units.parseTruncated(price);
      if (value !== null && value > 0n) {
        parsed.set(currency, value);
      }
    }
    return new Rates(parsed);
  }

  static async fetch(currencies: readonly string[]): Promise<Rates> {
    const priced = currencies.filter((currency) => !Rates.isUsdPegged(currency));
    const prices = await Promise.all(priced.map((currency) => Rates.fetchUsdPrice(currency)));
    return Rates.fromPrices(Object.fromEntries(priced.map((currency, index) => [currency, prices[index]])));
  }

  usdPrice(currency: string): bigint | null {
    if (Rates.isUsdPegged(currency)) {
      return Rates.one;
    }
    return this.usdPrices.get(currency) ?? null;
  }

  private static isUsdPegged(currency: string): boolean {
    return currency === Rates.usd || (Object.hasOwn(stablePeg, currency) && stablePeg[currency as PaymentCurrency] === Rates.usd);
  }

  private static async fetchUsdPrice(currency: string): Promise<string | null> {
    const market = (Object.hasOwn(stablePeg, currency) && stablePeg[currency as PaymentCurrency]) || currency;
    try {
      return (
        (await Rates.fetchQuote(market, Rates.preferredQuoteSource)) ?? (await Rates.fetchQuote(market, null))
      );
    } catch {
      return null;
    }
  }

  private static async fetchQuote(market: string, source: string | null): Promise<string | null> {
    const sourceParam = source === null ? '' : `&source=${source}`;
    const quotes = await Deadline.run(Deadline.requestMs, async (signal) => {
      const response = await fetch(`${Rates.source}?symbol=${market}${Rates.usd}${sourceParam}`, { signal });
      return response.ok ? ((await response.json()) as unknown) : null;
    });
    const price = Array.isArray(quotes) ? (quotes[0] as { price?: unknown } | undefined)?.price : undefined;
    return typeof price === 'string' ? price : null;
  }
}
