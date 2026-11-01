import type { SmartWalletIntent } from '../ctx/client.ts';
import { normalizeAmount } from '../ctx/amount-input.ts';
import { money } from '../money.ts';
import { network, type PaymentCurrency } from '../stellar/network.ts';
import { units } from '../stellar/units.ts';
import { VaultCall, type SentVaultCall, type VaultCallOutcome } from './vault-call.ts';

export type SavingsBalance = {
  currency: PaymentCurrency;
  shares: bigint;
  value: bigint;
};

export type DepositInput = {
  clear(): void;
  restore(): void;
};

export type DepositOutcome = VaultCallOutcome | 'unconfirmed';

export class UnansweredDeposit extends Error {
  constructor(cause: unknown) {
    super(Savings.depositUnconfirmedMessage, { cause });
    this.name = 'UnansweredDeposit';
  }

  static rethrow(error: unknown): never {
    if (VaultCall.refusedBySponsor(error)) {
      throw error;
    }
    throw new UnansweredDeposit(error);
  }
}

export class Savings {
  static get currencies(): PaymentCurrency[] {
    return Object.keys(network.vaults) as PaymentCurrency[];
  }
  static readonly depositCurrency: PaymentCurrency = 'XLM.USDC';
  static readonly maxYearlyRatePercent = 5;
  static readonly rateHeadline = `Earn up to ${Savings.maxYearlyRatePercent}% a year, variable`;
  static readonly riskShort = 'Its value can go down as well as up';
  static readonly riskNote =
    "Savings isn't a bank account and isn't covered by any deposit protection scheme. Its value can go down as well as up, so you could get back less than you put in. The rate is variable and can go up or down, and past returns are not a guide to future returns.";
  static readonly depositFailedMessage = 'The deposit failed. Your money is still in your balance.';
  static readonly depositPendingMessage = 'Still confirming. Check back in a minute.';
  static readonly depositUnconfirmedMessage =
    'The deposit may still be confirming. Check your savings before trying again.';

  static takes(currency: string | undefined): currency is PaymentCurrency {
    return currency !== undefined && Object.hasOwn(network.vaults, currency);
  }

  static vault(currency: PaymentCurrency): string {
    const vault = network.vaults[currency];
    if (!vault) {
      throw new Error(`Savings has no vault for ${currency}`);
    }
    return vault;
  }

  static depositIntent(
    currency: PaymentCurrency,
    amount: bigint,
  ): Extract<SmartWalletIntent, { intent: 'vault_deposit' }> {
    return { intent: 'vault_deposit', currency, amount: units.format(amount, units.decimals) };
  }

  static maxInput(inWallet: bigint): string {
    return units.format(inWallet, 2);
  }

  static depositAmount(input: string, inWallet: bigint, usedMax = false): bigint | null {
    if (usedMax) {
      return inWallet > 0n ? inWallet : null;
    }
    const normalized = normalizeAmount(input);
    if (normalized === null) {
      return null;
    }
    let amount: bigint;
    try {
      amount = units.parse(normalized);
    } catch {
      return null;
    }
    return amount > 0n && amount <= inWallet ? amount : null;
  }

  static depositMessage(outcome: DepositOutcome, currency: PaymentCurrency, amount: bigint): string {
    switch (outcome) {
      case 'success':
        return `Added ${money.token(amount, currency)} to savings`;
      case 'failed':
        return Savings.depositFailedMessage;
      case 'pending':
        return Savings.depositPendingMessage;
      case 'unconfirmed':
        return Savings.depositUnconfirmedMessage;
    }
  }

  static async sendDeposit(
    send: () => Promise<SentVaultCall>,
    vaultCall: VaultCall,
    input: DepositInput,
  ): Promise<DepositOutcome> {
    let sent: SentVaultCall;
    try {
      sent = await send();
    } catch (error) {
      if (error instanceof UnansweredDeposit) {
        input.clear();
        return 'unconfirmed';
      }
      throw error;
    }
    input.clear();
    const outcome = await vaultCall.settle(sent);
    if (outcome === 'failed') {
      input.restore();
    }
    return outcome;
  }
}
