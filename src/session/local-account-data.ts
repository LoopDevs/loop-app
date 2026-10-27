import { WalletPin, type WalletPinStorage } from '../wallet/wallet-pin.ts';
import { FavouriteIds } from './favourite-ids.ts';

export type LocalAccountDataDeps = {
  storage: WalletPinStorage;
  removeDeviceKey(userId: string): Promise<void>;
};

export class LocalAccountData {
  private readonly deps: LocalAccountDataDeps;
  private readonly userId: string;

  constructor(deps: LocalAccountDataDeps, userId: string) {
    this.deps = deps;
    this.userId = userId;
  }

  async forget(): Promise<void> {
    await Promise.all([
      this.deps.storage.removeItem(FavouriteIds.storageKey(this.userId)),
      new WalletPin(this.deps.storage, this.userId).clear(),
      this.deps.removeDeviceKey(this.userId),
    ]);
  }
}
