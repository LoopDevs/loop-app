import { money } from '../money.ts';
import { units } from '../stellar/units.ts';
import type { GiftCard, GiftCardInfo, MerchantJson, MerchantLinkJson } from './client.ts';

const basisPointsPerWhole = 10_000n;
const hueCount = 360;

export class Merchant {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly country: string;
  readonly currency: string;
  readonly denominationType: MerchantJson['denominationType'];
  readonly denominations: string[];
  readonly logoUrl?: string;
  readonly cardImageUrl?: string;
  readonly website?: string;
  readonly info?: GiftCardInfo;
  readonly userDiscount: number;
  readonly link?: MerchantLinkJson;

  constructor(json: MerchantJson) {
    this.id = json.id;
    this.slug = json.slug;
    this.name = json.name;
    this.country = json.country;
    this.currency = json.currency;
    this.denominationType = json.denominationType;
    this.denominations = json.denominations;
    this.logoUrl = json.logoUrl;
    this.cardImageUrl = json.cardImageUrl;
    this.website = json.website;
    this.info = json.info;
    this.userDiscount = json.userDiscount;
    this.link = json.link;
  }

  static searchPattern(name: string): string {
    return name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  static idsByRecentPurchase(giftCards: Pick<GiftCard, 'merchantId'>[], limit: number): string[] {
    return [...new Set(giftCards.map((giftCard) => giftCard.merchantId))].slice(0, limit);
  }

  static inOrder(merchants: Merchant[], ids: readonly string[]): Merchant[] {
    const byId = new Map(merchants.map((merchant) => [merchant.id, merchant]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  }

  static byCashback(merchants: Merchant[]): Merchant[] {
    return [...merchants].sort((a, b) => b.cashbackBasisPoints() - a.cashbackBasisPoints());
  }

  websiteUrl(): `${string}:${string}` | undefined {
    if (!this.website) {
      return undefined;
    }
    return /^https?:\/\//i.test(this.website)
      ? (this.website as `${string}:${string}`)
      : `https://${this.website}`;
  }

  initial(): string {
    return this.name.trim().charAt(0).toUpperCase();
  }

  tileHue(): number {
    let hash = 0;
    for (const character of this.name) {
      hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % hueCount;
    }
    return hash;
  }

  cashbackBasisPoints(): number {
    if (this.link?.userDiscountOverride && this.link.userDiscountBasisPoints !== undefined) {
      return this.link.userDiscountBasisPoints;
    }
    return this.userDiscount;
  }

  rateFigure(locale?: string): string {
    const rate = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 });
    return rate.format(this.cashbackBasisPoints() / Number(basisPointsPerWhole));
  }

  rateLabel(locale?: string): string {
    return `${this.rateFigure(locale)} cashback`;
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
