import { loopLinks } from '../constants/loop-links.ts';
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
  private readonly user: UserJson;
  readonly id: string;
  static readonly legalNameMessage = 'Enter your first and last name as they appear on your bank account.';

  readonly email?: string;
  readonly legalName?: string;
  readonly country?: string;
  readonly stableCurrency?: string;
  readonly cashbackDestination: CashbackDestination;
  readonly signInProviders: string[];
  readonly countries: string[];
  readonly stableCurrencies: string[];

  constructor(user: UserJson, company: MeJson['company']) {
    this.user = user;
    this.id = user.id;
    this.email = user.email;
    this.legalName = user.legalName;
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

  withUpdate(update: UserUpdate): Profile {
    return this.withUser({ ...this.user, ...update });
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

  isFor(email: string): boolean {
    const own = this.email?.trim().toLowerCase();
    return !!own && own === email.trim().toLowerCase();
  }

  deletionRequestMail(): string {
    const body = [
      'Please delete my Loop account.',
      '',
      `Account id: ${this.id}`,
      `Account email: ${this.email ?? ''}`,
    ].join('\n');
    return loopLinks.supportMail('Delete my account', body);
  }

  passkeyLabel(): string {
    return this.email?.trim() || 'Loop wallet';
  }

  hasBankIdentity(): boolean {
    return Profile.legalNameProblem(this.legalName ?? '') === null;
  }

  legalNameUpdate(legalName: string): UserUpdate | null {
    const trimmed = Profile.trimmedName(legalName);
    if (Profile.legalNameProblem(trimmed) !== null || trimmed === this.legalName) {
      return null;
    }
    return { legalName: trimmed };
  }

  static legalNameProblem(legalName: string): string | null {
    return Profile.trimmedName(legalName).split(' ').length >= 2 ? null : Profile.legalNameMessage;
  }

  private static trimmedName(legalName: string): string {
    return legalName.trim().split(/\s+/).filter(Boolean).join(' ');
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

  static savingsLabel(): string {
    return Savings.currencies.map((currency) => Profile.currencyLabel(currency)).join(' and ');
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
