import { CtxError } from '../ctx/ctx-error.ts';
import { units } from '../stellar/units.ts';
import { WalletPin } from '../wallet/wallet-pin.ts';
import type { Balances } from '../wallet/smart-wallet.ts';
import { FavouriteIds } from './favourite-ids.ts';

export type WalletBalances = {
  address: string;
  balances: Balances;
};

type WalletLinkShape = {
  address: string;
  chain: string;
  sponsored: boolean;
  status: string;
};

export class WalletFunds {
  static readonly unreadableMessage = "We couldn't check your wallet.";
  static readonly none = new WalletFunds([]);

  readonly wallets: readonly WalletBalances[];

  constructor(wallets: readonly WalletBalances[]) {
    this.wallets = wallets;
  }

  static async check(
    links: readonly WalletLinkShape[],
    balancesOf: (address: string) => Promise<Balances>,
  ): Promise<WalletFunds> {
    const wallets = await Promise.all(
      WalletPin.usable(links).map(async ({ address }) => ({ address, balances: await balancesOf(address) })),
    );
    return new WalletFunds(wallets);
  }

  static amountText(amount: bigint, symbol: string): string {
    const exact = units.format(amount, units.decimals).replace(/0+$/, '');
    const [whole, fraction] = exact.split('.');
    return `${whole}.${fraction.padEnd(2, '0')} ${symbol}`;
  }

  static amountsOf({ tokens, vaultValue }: Balances): string[] {
    const held = tokens
      .filter(({ amount }) => amount > 0n)
      .map(({ token, amount }) => WalletFunds.amountText(amount, token.symbol));
    return vaultValue > 0n ? [...held, `${WalletFunds.amountText(vaultValue, 'USDC')} in savings`] : held;
  }

  funded(): WalletBalances[] {
    return this.wallets.filter(({ balances }) => WalletFunds.amountsOf(balances).length > 0);
  }

  isEmpty(): boolean {
    return this.funded().length === 0;
  }

  acknowledgment(): string {
    const amounts = this.funded().flatMap(({ balances }) => WalletFunds.amountsOf(balances));
    return `I understand I lose ${WalletFunds.listed(amounts)}. After deletion I can't reach the money left in my wallet, and Loop can't recover it.`;
  }

  exceeds(acknowledged: WalletFunds): boolean {
    return this.wallets.some(({ address, balances }) => {
      const known = acknowledged.wallets.find((wallet) => wallet.address === address)?.balances;
      const knownToken = (currency: string) =>
        known?.tokens.find(({ token }) => token.currency === currency)?.amount ?? 0n;
      return (
        balances.tokens.some(({ token, amount }) => amount > knownToken(token.currency)) ||
        balances.vaultShares > (known?.vaultShares ?? 0n)
      );
    });
  }

  private static listed(amounts: readonly string[]): string {
    if (amounts.length <= 1) {
      return amounts.join('');
    }
    return `${amounts.slice(0, -1).join(', ')} and ${amounts[amounts.length - 1]}`;
  }
}

export type EraseReason = {
  code: string;
  currency?: string;
};

export type EraseResult =
  | { kind: 'erased' }
  | { kind: 'funds-changed' }
  | { kind: 'invalid-code' }
  | { kind: 'too-many-attempts' }
  | { kind: 'blocked'; reasons: EraseReason[] }
  | { kind: 'failed'; message: string };

export type AccountDeletionDeps = {
  userId(): Promise<string>;
  funds(): Promise<WalletFunds>;
  erase(code: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  clearSession(): Promise<void>;
};

const reasonMessages: Readonly<Record<string, string>> = {
  account_restricted: 'Your account is restricted. Contact support.',
  order_open: 'You have a gift card order that is unpaid or in progress. Wait for it to finish or expire.',
  refund_owed: 'A payment you made needs a refund. Contact support to get it first.',
  settlement_pending: 'A recent gift card purchase is still being finalised. Try again later.',
  cashback_pending: 'You have cashback on the way. Try again once it arrives.',
  payout_in_flight: "We're sending your Loop balance to your wallet. Try again once it arrives.",
  payout_failed: "We couldn't send your Loop balance to your wallet. Contact support to sort it out.",
  exchange_pending: "We're converting your Loop balance. Try again later.",
};

export class AccountDeletion {
  static readonly codeLifetimeMs = 20 * 60_000;
  static readonly invalidCodeMessage = "That code didn't work.";
  static readonly tooManyAttemptsMessage =
    'Too many wrong codes. You can ask for a new code 20 minutes after the last one was sent.';
  static readonly unknownReasonMessage = 'Something is still open on your account. Contact support.';
  static readonly erasedMessage =
    "Account deleted. You can remove the 'Loop' passkey from your password manager.";

  private readonly deps: AccountDeletionDeps;

  constructor(deps: AccountDeletionDeps) {
    this.deps = deps;
  }

  static newCodeAt(lastSentAt: number): number {
    return lastSentAt + AccountDeletion.codeLifetimeMs;
  }

  static reasonMessage({ code, currency }: EraseReason): string {
    if (code === 'balance_remaining') {
      return `You still have a Loop balance in ${currency ?? 'a currency'}. Contact support to have it paid out before you delete your account.`;
    }
    return reasonMessages[code] ?? AccountDeletion.unknownReasonMessage;
  }

  static refusalOf(error: unknown): EraseResult {
    if (!(error instanceof CtxError)) {
      return { kind: 'failed', message: error instanceof Error ? error.message : String(error) };
    }
    const name = error.errorName();
    if (error.status === 400 && name === 'ErrInvalidCode') {
      return { kind: 'invalid-code' };
    }
    if (error.status === 429 && name === 'Err2FATooManyAttempts') {
      return { kind: 'too-many-attempts' };
    }
    if (error.status === 409 && name === 'ErrUserEraseBlocked') {
      return { kind: 'blocked', reasons: AccountDeletion.reasonsIn(error.body) };
    }
    return { kind: 'failed', message: error.message };
  }

  private static reasonsIn(body: string): EraseReason[] {
    try {
      const { reasons } = JSON.parse(body) as { reasons?: unknown };
      if (!Array.isArray(reasons)) {
        return [];
      }
      return reasons.flatMap((reason: unknown) => {
        if (!reason || typeof reason !== 'object') {
          return [];
        }
        const { code, currency } = reason as Record<string, unknown>;
        if (typeof code !== 'string') {
          return [];
        }
        return [typeof currency === 'string' && currency ? { code, currency } : { code }];
      });
    } catch {
      return [];
    }
  }

  async erase(code: string, acknowledged: WalletFunds): Promise<EraseResult> {
    let funds: WalletFunds;
    try {
      funds = await this.deps.funds();
    } catch {
      return { kind: 'failed', message: WalletFunds.unreadableMessage };
    }
    if (funds.exceeds(acknowledged)) {
      return { kind: 'funds-changed' };
    }
    const userId = await this.deps.userId();
    try {
      await this.deps.erase(code);
    } catch (error) {
      return AccountDeletion.refusalOf(error);
    }
    try {
      await this.deps.removeItem(FavouriteIds.storageKey(userId));
    } finally {
      await this.deps.clearSession();
    }
    return { kind: 'erased' };
  }
}
