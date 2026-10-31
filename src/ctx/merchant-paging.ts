import type { Merchant } from '@/ctx/merchant';

export class MerchantPaging {
  static nextPage(page: number, pages: number, busy: boolean): number | null {
    return !busy && page > 0 && page < pages ? page + 1 : null;
  }

  static merge(shown: readonly Merchant[], loaded: readonly Merchant[], page: number): Merchant[] {
    if (page === 1) {
      return [...loaded];
    }
    const seen = new Set(shown.map((merchant) => merchant.id));
    return [...shown, ...loaded.filter((merchant) => !seen.has(merchant.id))];
  }
}

export class CategoryTally {
  private readonly names: string[] = [];
  private readonly known = new Set<string>();

  add(merchants: readonly Merchant[]): void {
    for (const category of merchants.flatMap((merchant) => merchant.categories)) {
      if (!this.known.has(category)) {
        this.known.add(category);
        this.names.push(category);
      }
    }
  }

  list(): string[] {
    return [...this.names];
  }
}
