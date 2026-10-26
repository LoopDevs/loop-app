import type { MeJson, UserJson, UserUpdate } from './client.ts';

const regionalIndicatorOffset = 0x1f1e6 - 'A'.charCodeAt(0);

const signInProviderNames: Record<string, string> = {
  apple: 'Apple',
  google: 'Google',
};

export type CountryChoice = {
  country: string;
  stableCurrency?: string;
};

export class Profile {
  readonly email?: string;
  readonly country?: string;
  readonly stableCurrency?: string;
  readonly signInProviders: string[];
  readonly countries: string[];
  readonly stableCurrencies: string[];

  constructor(user: UserJson, company: MeJson['company']) {
    this.email = user.email;
    this.country = user.country;
    this.stableCurrency = user.stableCurrency;
    this.signInProviders = (user.oauthIdentities ?? []).map((identity) => identity.provider);
    this.countries = company?.countries ?? [];
    this.stableCurrencies = company?.stableCurrencies ?? [];
  }

  static fromMe(me: MeJson): Profile {
    return new Profile(me.user, me.company);
  }

  withUser(user: UserJson): Profile {
    return new Profile(user, {
      countries: this.countries,
      stableCurrencies: this.stableCurrencies,
    });
  }

  needsCurrencyChoice(): boolean {
    return !this.stableCurrency && this.stableCurrencies.length > 0;
  }

  needsSetup(): boolean {
    return !this.country || this.needsCurrencyChoice();
  }

  nextUpdate(choice: CountryChoice): UserUpdate | null {
    if (this.needsCurrencyChoice()) {
      const chosen = choice.stableCurrency;
      return chosen && this.stableCurrencies.includes(chosen) ? { stableCurrency: chosen } : null;
    }
    if (choice.country !== this.country && this.countries.includes(choice.country)) {
      return { country: choice.country };
    }
    return null;
  }

  signInProviderLabel(): string | null {
    const names = [...new Set(this.signInProviders)]
      .map((provider) => signInProviderNames[provider])
      .filter((name) => name !== undefined);
    return names.length > 0 ? `Signed in with ${names.join(' and ')}` : null;
  }

  static currencyLabel(currency: string): string {
    return currency.slice(currency.lastIndexOf('.') + 1);
  }

  static countryFlag(country: string): string {
    if (!/^[A-Z]{2}$/.test(country)) {
      return '';
    }
    return String.fromCodePoint(
      ...[...country].map((letter) => letter.charCodeAt(0) + regionalIndicatorOffset),
    );
  }
}
