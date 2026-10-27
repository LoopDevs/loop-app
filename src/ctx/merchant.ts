import { money } from '../money.ts';
import { units } from '../stellar/units.ts';
import { invalidAmountMessage, normalizeAmount } from './amount-input.ts';
import type { GiftCard, GiftCardInfo, MerchantJson, MerchantRedeemLocation, MerchantRedeemType } from './client.ts';

const basisPointsPerWhole = 10_000n;
const hueCount = 360;

type QuotedOrder = Pick<GiftCard, 'status' | 'cardFiatAmount' | 'cardFiatCurrency' | 'userDiscountBasisPoints'>;

function currencyDigits(currency: string): number {
  try {
    const formatter = new Intl.NumberFormat('en', { style: 'currency', currency });
    return formatter.resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export class CashbackRate {
  static readonly quotedStatuses: readonly GiftCard['status'][] = ['unpaid', 'paid'];

  readonly basisPoints: number;

  constructor(basisPoints: number) {
    this.basisPoints = basisPoints;
  }

  static ofMerchant({ userDiscount, link }: Pick<MerchantJson, 'userDiscount' | 'link'>): CashbackRate {
    const override = link?.userDiscountOverride ? link.userDiscountBasisPoints : undefined;
    return new CashbackRate(override ?? userDiscount);
  }

  static quotedFor(order: QuotedOrder, locale?: string): string | null {
    const basisPoints = order.userDiscountBasisPoints;
    if (!CashbackRate.quotedStatuses.includes(order.status) || basisPoints === undefined || basisPoints <= 0) {
      return null;
    }
    const rate = new CashbackRate(basisPoints);
    const amount = rate.on(order.cardFiatAmount, order.cardFiatCurrency, locale);
    return amount && `About ${amount} (${rate.figure(locale)})`;
  }

  figure(locale?: string): string {
    const rate = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 });
    return rate.format(this.basisPoints / Number(basisPointsPerWhole));
  }

  label(locale?: string): string {
    return `${this.figure(locale)} cashback`;
  }

  on(amount: string, currency: string, locale?: string): string | null {
    let parsed: bigint;
    try {
      parsed = units.parse(amount);
    } catch {
      return null;
    }
    if (parsed <= 0n) {
      return null;
    }
    const subunit = 10n ** BigInt(units.decimals - currencyDigits(currency));
    const divisor = basisPointsPerWhole * subunit;
    const subunits = (parsed * BigInt(this.basisPoints) + divisor / 2n) / divisor;
    return money.fiat(units.format(subunits * subunit, units.decimals), currency, locale);
  }
}

export class Merchant {
  static readonly quickAmountChoices = ['10', '25', '50', '100', '200', '500'];
  static readonly quickAmountCount = 4;
  static readonly redeemLocationLabels: Record<MerchantRedeemLocation, string> = {
    any: 'Online and in store',
    online: 'Online',
    physical: 'In store',
  };
  static readonly redeemTypeLabels: Record<MerchantRedeemType, string> = {
    barcode: 'A code and barcode',
    url: 'A link to redeem',
  };

  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly country: string;
  readonly currency: string;
  readonly denominationType: MerchantJson['denominationType'];
  readonly denominationValues: string[];
  readonly logoUrl?: string;
  readonly cardImageUrl?: string;
  readonly website?: string;
  readonly categories: string[];
  readonly redeemLocation?: MerchantRedeemLocation;
  readonly redeemType?: MerchantRedeemType;
  readonly info?: GiftCardInfo;
  readonly cashback: CashbackRate;

  constructor(json: MerchantJson) {
    this.id = json.id;
    this.slug = json.slug;
    this.name = json.name;
    this.country = json.country;
    this.currency = json.currency;
    this.denominationType = json.denominationType;
    this.denominationValues = json.denominationValues ?? [];
    this.logoUrl = json.logoUrl;
    this.cardImageUrl = json.cardImageUrl;
    this.website = json.website;
    this.categories = json.categories ?? [];
    this.redeemLocation = json.redeemLocation || undefined;
    this.redeemType = json.redeemType || undefined;
    this.info = json.info;
    this.cashback = CashbackRate.ofMerchant(json);
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

  static matching(merchants: Iterable<Merchant>, query: string, limit: number): Merchant[] {
    const needle = Merchant.searchKey(query);
    if (!needle) {
      return [];
    }
    const ranked = new Map<string, { merchant: Merchant; rank: number }>();
    for (const merchant of merchants) {
      const rank = merchant.matchRank(needle);
      if (rank !== null && !ranked.has(merchant.id)) {
        ranked.set(merchant.id, { merchant, rank });
      }
    }
    return [...ranked.values()]
      .sort(
        (a, b) =>
          a.rank - b.rank ||
          b.merchant.cashbackBasisPoints() - a.merchant.cashbackBasisPoints() ||
          a.merchant.name.localeCompare(b.merchant.name),
      )
      .slice(0, limit)
      .map(({ merchant }) => merchant);
  }

  private static searchKey(text: string): string {
    return text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .trim();
  }

  private matchRank(needle: string): number | null {
    const name = Merchant.searchKey(this.name);
    if (name.startsWith(needle)) {
      return 0;
    }
    const at = name.indexOf(needle);
    if (at === -1) {
      return null;
    }
    return /[a-z0-9]/.test(name.charAt(at - 1)) ? 2 : 1;
  }

  static categoriesOf(merchants: Merchant[]): string[] {
    const counts = new Map<string, number>();
    for (const category of merchants.flatMap((merchant) => merchant.categories)) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([category]) => category);
  }

  static categoryLabel(category: string): string {
    return category.charAt(0).toUpperCase() + category.slice(1);
  }

  websiteLabel(): string | undefined {
    return this.website
      ?.trim()
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/\/+$/, '');
  }

  isSoldIn(country: string | undefined): boolean {
    return country === undefined || this.country === country;
  }

  whereToUse(): string | null {
    return this.redeemLocation ? (Merchant.redeemLocationLabels[this.redeemLocation] ?? null) : null;
  }

  deliveryLabel(): string | null {
    return this.redeemType ? (Merchant.redeemTypeLabels[this.redeemType] ?? null) : null;
  }

  amountsLabel(locale?: string): string | null {
    if (this.denominationType !== 'fixed') {
      return this.rangeLabel(locale);
    }
    if (this.denominationValues.length === 0) {
      return null;
    }
    return this.denominationValues.map((amount) => this.shortAmount(amount, locale)).join(', ');
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
    return this.cashback.basisPoints;
  }

  rateFigure(locale?: string): string {
    return this.cashback.figure(locale);
  }

  rateLabel(locale?: string): string {
    return this.cashback.label(locale);
  }

  cashbackEstimate(amount: string, locale?: string): string | null {
    return this.cashback.on(amount, this.currency, locale);
  }

  amountRange(): { min: string; max: string } | null {
    if (this.denominationType === 'fixed') {
      return null;
    }
    const [min, max] = this.denominationValues;
    return min && max ? { min, max } : null;
  }

  rangeLabel(locale?: string): string | null {
    const range = this.amountRange();
    return range && `${this.shortAmount(range.min, locale)} – ${this.shortAmount(range.max, locale)}`;
  }

  quickAmounts(): string[] {
    const range = this.amountRange();
    if (!range) {
      return [];
    }
    return Merchant.quickAmountChoices
      .filter((amount) => this.inRange(amount, range))
      .slice(0, Merchant.quickAmountCount);
  }

  amountProblem(input: string, locale?: string): string | null {
    if (input.trim() === '') {
      return null;
    }
    const amount = normalizeAmount(input);
    if (!amount) {
      return invalidAmountMessage;
    }
    const range = this.amountRange();
    if (!range) {
      return null;
    }
    const fraction = amount.split('.')[1] ?? '';
    const significant = fraction.replace(/0+$/, '');
    if (this.denominationType === 'min-max-major' && significant !== '') {
      return 'Enter a whole amount, like 25';
    }
    if (significant.length > this.currencyDigits()) {
      return invalidAmountMessage;
    }
    if (!this.inRange(amount, range)) {
      return `Enter between ${this.shortAmount(range.min, locale)} and ${this.shortAmount(range.max, locale)}`;
    }
    return null;
  }

  shortAmount(amount: string, locale?: string): string {
    const whole = /^\d+(\.0*)?$/.test(amount.trim());
    try {
      const formatter = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: this.currency,
        ...(whole ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
      });
      return formatter.format(Number(amount));
    } catch {
      return `${amount} ${this.currency}`;
    }
  }

  private inRange(amount: string, range: { min: string; max: string }): boolean {
    const value = units.parseTruncated(amount);
    const min = units.parseTruncated(range.min);
    const max = units.parseTruncated(range.max);
    return value !== null && min !== null && max !== null && value >= min && value <= max;
  }

  private currencyDigits(): number {
    return currencyDigits(this.currency);
  }
}
