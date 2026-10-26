export class FavouriteIds {
  readonly ids: readonly string[];

  constructor(ids: readonly string[]) {
    this.ids = ids;
  }

  static parse(stored: string | null): FavouriteIds {
    if (!stored) {
      return new FavouriteIds([]);
    }
    try {
      const parsed: unknown = JSON.parse(stored);
      return new FavouriteIds(
        Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [],
      );
    } catch {
      return new FavouriteIds([]);
    }
  }

  static storageKey(userId: string): string {
    return `favourites.${userId}`;
  }

  has(id: string): boolean {
    return this.ids.includes(id);
  }

  toggled(id: string): FavouriteIds {
    return this.has(id)
      ? new FavouriteIds(this.ids.filter((held) => held !== id))
      : new FavouriteIds([id, ...this.ids]);
  }

  serialize(): string {
    return JSON.stringify(this.ids);
  }
}
