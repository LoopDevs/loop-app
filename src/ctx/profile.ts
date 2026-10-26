import { offeredCurrencies, stablePeg, type PaymentCurrency } from '../stellar/network.ts';
import { Savings } from '../wallet/savings.ts';
import type { CashbackDestination, MeJson, UserJson, UserUpdate } from './client.ts';

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
  readonly cashbackDestination: CashbackDestination;
  readonly signInProviders: string[];
  readonly countries: string[];
  readonly stableCurrencies: string[];

  constructor(user: UserJson, company: MeJson['company']) {
    this.email = user.email;
    this.country = user.country;
    this.stableCurrency = user.stableCurrency;
    this.cashbackDestination = user.cashbackDestination ?? 'account';
    this.signInProviders = (user.oauthIdentities ?? []).map((identity) => identity.provider);
    this.countries = company?.countries ?? [];
    this.stableCurrencies = (company?.stableCurrencies ?? []).filter((currency) => offeredCurrencies.has(currency));
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

  passkeyLabel(): string {
    return this.email?.trim() || 'Loop wallet';
  }

  savesCashback(): boolean {
    return this.cashbackDestination === 'savings';
  }

  cashbackDestinations(): CashbackDestination[] {
    return Savings.takes(this.stableCurrency) || this.savesCashback() ? ['account', 'savings'] : ['account'];
  }

  destinationUpdate(destination: CashbackDestination): UserUpdate | null {
    if (destination === this.cashbackDestination || !this.cashbackDestinations().includes(destination)) {
      return null;
    }
    return { cashbackDestination: destination };
  }

  signInProviderLabel(): string | null {
    const names = [...new Set(this.signInProviders)]
      .map((provider) => signInProviderNames[provider])
      .filter((name) => name !== undefined);
    return names.length > 0 ? `Signed in with ${names.join(' and ')}` : null;
  }

  static currencyLabel(currency: string): string {
    const code = Object.hasOwn(stablePeg, currency) ? stablePeg[currency as PaymentCurrency] : currency;
    if (!code) {
      return currency;
    }
    try {
      return new Intl.DisplayNames(['en'], { type: 'currency' }).of(code) ?? code;
    } catch {
      return code;
    }
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
