const euroCountries = [
  'AT',
  'BE',
  'CY',
  'DE',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PT',
  'SI',
  'SK',
] as const;

export class Market {
  static readonly countries: readonly string[] = ['US', 'GB', 'CA', ...euroCountries];
  static readonly fallback = 'US';
  static readonly storageKey = 'market.country';

  static supports(country: string | null | undefined): country is string {
    return typeof country === 'string' && Market.countries.includes(country);
  }

  static resolve(chosen: string | null | undefined, locales: readonly (string | undefined)[]): string {
    if (Market.supports(chosen)) {
      return chosen;
    }
    for (const locale of locales) {
      const region = Market.regionOf(locale);
      if (Market.supports(region)) {
        return region;
      }
    }
    return Market.fallback;
  }

  static regionOf(locale: string | undefined): string | undefined {
    const region = /^[a-z]{2,3}(?:[-_][A-Za-z]{4})?[-_]([A-Za-z]{2})(?:[-_]|$)/i.exec(locale ?? '')?.[1];
    return region?.toUpperCase();
  }

  static countryName(country: string, locale?: string): string {
    try {
      return new Intl.DisplayNames(locale, { type: 'region' }).of(country) ?? country;
    } catch {
      return country;
    }
  }
}
