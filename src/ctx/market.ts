const euroCountries = [
  "AT",
  "BE",
  "CY",
  "DE",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PT",
  "SI",
  "SK",
] as const;

const localCurrencies: Record<string, string> = {
  US: "USD",
  GB: "GBP",
  CA: "CAD",
};

export class Market {
  static readonly countries: readonly string[] = [
    "US",
    "GB",
    "CA",
    ...euroCountries,
  ];
  static readonly fallback = "US";
  static readonly storageKey = "market.country";

  static supports(country: string | null | undefined): country is string {
    return typeof country === "string" && Market.countries.includes(country);
  }

  static resolve(
    chosen: string | null | undefined,
    located: string | null | undefined,
    locales: readonly (string | undefined)[],
  ): string {
    if (Market.supports(chosen)) {
      return chosen;
    }
    if (Market.supports(located)) {
      return located;
    }
    for (const locale of locales) {
      const region = Market.regionOf(locale);
      if (Market.supports(region)) {
        return region;
      }
    }
    return Market.fallback;
  }

  static localCurrency(country: string): string {
    if ((euroCountries as readonly string[]).includes(country)) {
      return "EUR";
    }
    return localCurrencies[country] ?? "USD";
  }

  static regionOf(locale: string | undefined): string | undefined {
    const region =
      /^[a-z]{2,3}(?:[-_][A-Za-z]{4})?[-_]([A-Za-z]{2})(?:[-_]|$)/i.exec(
        locale ?? "",
      )?.[1];
    return region?.toUpperCase();
  }

  static countryName(country: string, locale?: string): string {
    try {
      return (
        new Intl.DisplayNames(locale, { type: "region" }).of(country) ?? country
      );
    } catch {
      return country;
    }
  }
}
