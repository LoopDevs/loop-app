import { units } from '../stellar/units.ts';
import type { AccountJson, BalanceJson } from './client.ts';
import { Payout } from './payout.ts';

export class Account {
  readonly wallet: BalanceJson[];
  readonly payouts: Payout[];

  constructor(json: AccountJson) {
    this.wallet = json.wallet ?? [];
    this.payouts = (json.payouts ?? []).map((payout) => new Payout(payout));
  }

  hasDelayedCashback(): boolean {
    return this.payouts.some((payout) => payout.status === 'failed' && payout.isInFlight());
  }

  receivedCashback(currencies: ReadonlySet<string>): bigint {
    return this.receivedCashbackByCurrency(currencies).reduce((sum, { amount }) => sum + amount, 0n);
  }

  receivedCashbackByCurrency(currencies: ReadonlySet<string>): { currency: string; amount: bigint }[] {
    const sums = new Map<string, bigint>();
    for (const payout of this.payouts) {
      if (payout.status === 'complete' && currencies.has(payout.currency)) {
        sums.set(payout.currency, (sums.get(payout.currency) ?? 0n) + units.parse(payout.netAmount()));
      }
    }
    return [...sums].map(([currency, amount]) => ({ currency, amount }));
  }
}
