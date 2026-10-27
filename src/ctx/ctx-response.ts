import type { AccountJson, BuiltTransaction, GiftCard, SponsoredResult, WalletLink } from './client.ts';
import { CtxError } from './ctx-error.ts';
import { Payout } from './payout.ts';

export class UnexpectedResponse extends Error {
  readonly detail: string;

  constructor(detail: string) {
    super(CtxError.serverFailedMessage);
    this.name = 'UnexpectedResponse';
    this.detail = detail;
  }
}

const reportedSkips = new Set<string>();

export class CtxResponse {
  static readonly giftCardStatuses: readonly GiftCard['status'][] = [
    'unpaid',
    'paid',
    'fulfilled',
    'rejected',
    'refunded',
    'expired',
  ];
  static readonly paymentStatuses: readonly GiftCard['paymentStatus'][] = [
    'unpaid',
    'paid',
    'error',
    'refunded',
    'cancelled',
    'expired',
  ];

  private readonly shape: string;
  private readonly json: Record<string, unknown>;

  private constructor(shape: string, value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new UnexpectedResponse(`CTX ${shape} response is not an object`);
    }
    this.shape = shape;
    this.json = value as Record<string, unknown>;
  }

  static giftCard(value: unknown): GiftCard {
    new CtxResponse('gift card', value)
      .strings(
        'id',
        'merchantId',
        'merchantName',
        'created',
        'cardFiatAmount',
        'cardFiatCurrency',
        'paymentId',
        'paymentMethod',
      )
      .oneOf('status', CtxResponse.giftCardStatuses)
      .oneOf('paymentStatus', CtxResponse.paymentStatuses)
      .optionalStrings(
        'paymentCryptoAmount',
        'paymentCryptoCurrency',
        'paymentCryptoAddress',
        'paymentCryptoTxId',
        'paymentUrlExpiration',
        'cashbackAmount',
        'cashbackCurrency',
      )
      .optionalBooleans('cashbackCredited', 'cashbackReversed');
    return value as GiftCard;
  }

  static walletLink(value: unknown): WalletLink {
    new CtxResponse('wallet link', value).strings('id', 'chain', 'address', 'status').booleans('sponsored');
    return value as WalletLink;
  }

  static builtTransaction(value: unknown): BuiltTransaction {
    new CtxResponse('built transaction', value)
      .strings('transaction', 'digest')
      .integers('expiryLedger')
      .check(['contextRuleIds'], (ids) => Array.isArray(ids) && ids.every((id) => Number.isInteger(id)));
    return value as BuiltTransaction;
  }

  static sponsored(value: unknown): SponsoredResult {
    new CtxResponse('sponsor', value).strings('hash', 'status').optionalStrings('error');
    return value as SponsoredResult;
  }

  static account(value: unknown, skipped: (detail: string) => void): AccountJson {
    const account = new CtxResponse('account', value);
    account.nullableList('wallet', (balance) => {
      new CtxResponse('account balance', balance).strings('currency', 'amount');
    });
    account.nullableList('payouts', (payout) => {
      new CtxResponse('payout', payout)
        .strings('id', 'currency', 'amount', 'status')
        .optionalStrings(
          'kind',
          'address',
          'sentAmount',
          'txHash',
          'retryAt',
          'reservationTransferId',
          'reversalTransferId',
        );
    });
    const json = value as AccountJson;
    const payouts = json.payouts?.filter((payout) => {
      if (Payout.isKnown(payout)) {
        return true;
      }
      CtxResponse.reportSkipOnce(
        `payout:${payout.id}`,
        `CTX payout has an unknown status "${payout.status}" or kind "${payout.kind}"`,
        skipped,
      );
      return false;
    });
    return { ...json, payouts: payouts ?? null };
  }

  static listOf<T>(
    shape: string,
    value: unknown,
    item: (value: unknown) => T,
    skipped: (detail: string) => void,
  ): T[] {
    if (value === null || value === undefined) {
      return [];
    }
    if (!Array.isArray(value)) {
      throw new UnexpectedResponse(`CTX ${shape} response is not a list`);
    }
    const items: T[] = [];
    for (const entry of value) {
      try {
        items.push(item(entry));
      } catch (error) {
        if (!(error instanceof UnexpectedResponse)) {
          throw error;
        }
        CtxResponse.reportSkipOnce(`${shape}:${CtxResponse.idOf(entry) ?? error.detail}`, error.detail, skipped);
      }
    }
    return items;
  }

  private static idOf(value: unknown): string | null {
    const id = value && typeof value === 'object' ? (value as { id?: unknown }).id : undefined;
    return typeof id === 'string' ? id : null;
  }

  private static reportSkipOnce(key: string, detail: string, skipped: (detail: string) => void): void {
    if (reportedSkips.has(key)) {
      return;
    }
    reportedSkips.add(key);
    skipped(detail);
  }

  private strings(...names: string[]): this {
    return this.check(names, (value) => typeof value === 'string');
  }

  private optionalStrings(...names: string[]): this {
    return this.check(names, (value) => value === undefined || typeof value === 'string');
  }

  private booleans(...names: string[]): this {
    return this.check(names, (value) => typeof value === 'boolean');
  }

  private optionalBooleans(...names: string[]): this {
    return this.check(names, (value) => value === undefined || typeof value === 'boolean');
  }

  private integers(...names: string[]): this {
    return this.check(names, (value) => Number.isInteger(value));
  }

  private oneOf(name: string, allowed: readonly string[]): this {
    return this.check([name], (value) => typeof value === 'string' && allowed.includes(value));
  }

  private nullableList(name: string, item: (value: unknown) => void): this {
    const value = this.json[name];
    if (value === null || value === undefined) {
      return this;
    }
    if (!Array.isArray(value)) {
      throw this.unexpected(name);
    }
    value.forEach(item);
    return this;
  }

  private check(names: string[], valid: (value: unknown) => boolean): this {
    const invalid = names.find((name) => !valid(this.json[name]));
    if (invalid !== undefined) {
      throw this.unexpected(invalid);
    }
    return this;
  }

  private unexpected(name: string): UnexpectedResponse {
    return new UnexpectedResponse(`CTX ${this.shape} response has an unexpected ${name}`);
  }
}
