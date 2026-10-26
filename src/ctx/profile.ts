import { Savings } from '../wallet/savings.ts';
import type { CashbackDestination, MeJson, UserJson, UserUpdate } from './client.ts';

const regionalIndicatorOffset = 0x1f1e6 - 'A'.charCodeAt(0);

export type CountryChoice = {
  country: string;
  stableCurrency?: string;
};

export class Profile {
  readonly country?: string;
  readonly stableCurrency?: string;
  readonly cashbackDestination: CashbackDestination;
  readonly countries: string[];
  readonly stableCurrencies: string[];

  constructor(user: UserJson, company: MeJson['company']) {
    this.country = user.country;
    this.stableCurrency = user.stableCurrency;
    this.cashbackDestination = user.cashbackDestination ?? 'account';
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
