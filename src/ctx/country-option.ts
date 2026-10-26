import { stablePeg, type PaymentCurrency } from "../stellar/network.ts";
import { Market } from "./market.ts";
import { Profile, type CountryChoice } from "./profile.ts";

export class CountryOption {
  readonly country: string;
  readonly stableCurrency: string | undefined;
  readonly currencyCode: string;

  private constructor(
    country: string,
    stableCurrency: string | undefined,
    currencyCode: string,
  ) {
    this.country = country;
    this.stableCurrency = stableCurrency;
    this.currencyCode = currencyCode;
  }

  static forProfile(profile: Profile): CountryOption[] {
    return profile.countries
      .map((country) => CountryOption.of(profile, country))
      .sort((a, b) => a.name().localeCompare(b.name()));
  }

  static suggested(
    options: readonly CountryOption[],
    preferred: readonly (string | undefined)[],
  ): CountryOption | undefined {
    for (const country of preferred) {
      const match = options.find((option) => option.country === country);
      if (match) {
        return match;
      }
    }
    return options[0];
  }

  private static of(profile: Profile, country: string): CountryOption {
    if (profile.stableCurrency) {
      return new CountryOption(
        country,
        undefined,
        CountryOption.codeOf(profile.stableCurrency),
      );
    }
    const local = Market.localCurrency(country);
    const paired =
      profile.stableCurrencies.find(
        (currency) => CountryOption.codeOf(currency) === local,
      ) ??
      profile.stableCurrencies.find(
        (currency) => CountryOption.codeOf(currency) === "USD",
      ) ??
      profile.stableCurrencies[0];
    return new CountryOption(
      country,
      paired,
      paired ? CountryOption.codeOf(paired) : local,
    );
  }

  private static codeOf(currency: string): string {
    const peg = Object.hasOwn(stablePeg, currency)
      ? stablePeg[currency as PaymentCurrency]
      : null;
    return peg ?? currency;
  }

  name(): string {
    return Market.countryName(this.country);
  }

  label(): string {
    return `${this.name()} - ${this.currencyCode}`;
  }

  flag(): string {
    return Profile.countryFlag(this.country);
  }

  matches(query: string): boolean {
    const wanted = query.trim().toLowerCase();
    return (
      wanted === "" ||
      [this.name(), this.country, this.currencyCode].some((text) =>
        text.toLowerCase().includes(wanted),
      )
    );
  }

  choice(): CountryChoice {
    return { country: this.country, stableCurrency: this.stableCurrency };
  }
}
