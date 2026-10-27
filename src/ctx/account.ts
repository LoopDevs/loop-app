import { units } from '../stellar/units.ts';
import { Savings } from '../wallet/savings.ts';
import type { AccountJson, BalanceJson } from './client.ts';
import { Payout } from './payout.ts';
import { Profile } from './profile.ts';

export type OnTheWayItem = {
  key: string;
  currency: string;
  amount: string;
  label: string;
  destination?: string;
  heldBySavings: boolean;
};

type CashbackRouting = Pick<Profile, 'stableCurrency' | 'savesCashback'>;

export class Account {
  static readonly shownUnit = units.parse('0.01');

  readonly wallet: BalanceJson[];
  readonly payouts: Payout[];

  private readonly json: AccountJson;

  constructor(json: AccountJson) {
    this.json = json;
    this.wallet = json.wallet ?? [];
    this.payouts = (json.payouts ?? []).map((payout) => new Payout(payout));
  }

  async withoutLandedPayouts(isLanded: (txHash: string) => Promise<boolean>): Promise<Account> {
    const landed = await Promise.all(
      this.payouts.map((payout) => payout.isInFlight() && !!payout.txHash && isLanded(payout.txHash)),
    );
    const landedIds = new Set(this.payouts.filter((_, index) => landed[index]).map((payout) => payout.id));
    if (landedIds.size === 0) {
      return this;
    }
    return new Account({
      ...this.json,
      payouts: (this.json.payouts ?? []).filter((payout) => !landedIds.has(payout.id)),
    });
  }

  static hasAmount(amount: string): boolean {
    try {
      return units.parse(amount) >= Account.shownUnit;
    } catch {
      return false;
    }
  }

  onTheWay(routing: CashbackRouting): OnTheWayItem[] {
    const balances = this.wallet
      .filter((balance) => Account.hasAmount(balance.amount))
      .map((balance) => this.balanceItem(balance, routing));
    const payouts = this.payouts
      .filter((payout) => payout.isInFlight())
      .map(
        (payout): OnTheWayItem => ({
          key: `payout:${payout.id}`,
          currency: payout.currency,
          amount: payout.netAmount(),
          label: payout.statusLabel(),
          destination: payout.destinationLabel(),
          heldBySavings: false,
        }),
      );
    return [...balances, ...payouts];
  }

  private balanceItem(balance: BalanceJson, routing: CashbackRouting): OnTheWayItem {
    const item = {
      key: `balance:${balance.currency}`,
      currency: balance.currency,
      amount: balance.amount,
      heldBySavings: false,
    };
    if (this.hasFailedPayout(balance.currency)) {
      return { ...item, label: 'delayed, contact support' };
    }
    if (balance.currency === 'XLM' && routing.stableCurrency) {
      return { ...item, label: `converts to ${Profile.currencyLabel(routing.stableCurrency)} when a conversion is available` };
    }
    if (routing.savesCashback() && Savings.takes(balance.currency)) {
      return { ...item, label: 'goes to savings when savings is available' };
    }
    if (routing.savesCashback()) {
      return {
        ...item,
        label: `held: Loop savings holds ${Profile.currencyLabel(Savings.currency)}, switch to Account to receive it`,
        heldBySavings: true,
      };
    }
    return { ...item, label: 'waiting for payout' };
  }

  private hasFailedPayout(currency: string): boolean {
    return this.payouts.some((payout) => payout.currency === currency && payout.status === 'failed' && payout.isInFlight());
  }
}
