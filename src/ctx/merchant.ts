import { money } from '../money.ts';
import { units } from '../stellar/units.ts';
import type { MerchantJson, MerchantLinkJson } from './client.ts';

const basisPointsPerWhole = 10_000n;

export class Merchant {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly denominationType: MerchantJson['denominationType'];
  readonly denominations: string[];
  readonly logoUrl?: string;
  readonly userDiscount: number;
  readonly link?: MerchantLinkJson;

  constructor(json: MerchantJson) {
    this.id = json.id;
    this.name = json.name;
    this.currency = json.currency;
    this.denominationType = json.denominationType;
    this.denominations = json.denominations;
    this.logoUrl = json.logoUrl;
    this.userDiscount = json.userDiscount;
    this.link = json.link;
  }

  cashbackBasisPoints(): number {
    if (this.link?.userDiscountOverride && this.link.userDiscountBasisPoints !== undefined) {
      return this.link.userDiscountBasisPoints;
    }
    return this.userDiscount;
  }

  rateLabel(locale?: string): string {
    const rate = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 });
    return `${rate.format(this.cashbackBasisPoints() / Number(basisPointsPerWhole))} cashback`;
  }

  cashbackEstimate(amount: string, locale?: string): string | null {
    let parsed: bigint;
    try {
      parsed = units.parse(amount);
    } catch {
      return null;
    }
    if (parsed <= 0n) {
      return null;
    }
    const subunit = 10n ** BigInt(units.decimals - this.currencyDigits());
    const divisor = basisPointsPerWhole * subunit;
    const subunits = (parsed * BigInt(this.cashbackBasisPoints()) + divisor / 2n) / divisor;
    return money.fiat(units.format(subunits * subunit, units.decimals), this.currency, locale);
  }

  private currencyDigits(): number {
    try {
      const formatter = new Intl.NumberFormat('en', { style: 'currency', currency: this.currency });
      return formatter.resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
      return 2;
    }
  }
}
