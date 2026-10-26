import { scValToNative } from '@stellar/stellar-sdk';

import type { SmartWalletIntent } from '../ctx/client.ts';
import { normalizeAmount } from '../ctx/amount-input.ts';
import { money } from '../money.ts';
import { network, type PaymentCurrency } from '../stellar/network.ts';
import { units } from '../stellar/units.ts';
import type { AuthorizedCall, ContractCall } from './sponsored-call.ts';
import type { SentVaultCall, VaultCall, VaultCallOutcome } from './vault-call.ts';

export type DepositInput = {
  clear(): void;
  restore(): void;
};

export class Savings {
  static readonly currency: PaymentCurrency = 'XLM.USDC';
  static readonly maxYearlyRatePercent = 5;
  static readonly rateHeadline = `Earn up to ${Savings.maxYearlyRatePercent}% a year, variable`;
  static readonly depositFailedMessage = 'The deposit failed. Your USDC is still in your wallet.';

  static takes(currency: string | undefined): boolean {
    return currency === Savings.currency;
  }

  static depositIntent(amount: bigint): Extract<SmartWalletIntent, { intent: 'vault_deposit' }> {
    return { intent: 'vault_deposit', currency: Savings.currency, amount: units.format(amount, units.decimals) };
  }

  static depositAmount(input: string, walletUsdc: bigint): bigint | null {
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
    return amount > 0n && amount <= walletUsdc ? amount : null;
  }

  static depositMessage(outcome: VaultCallOutcome, amount: bigint, hash: string): string {
    switch (outcome) {
      case 'success':
        return `Added ${money.payment(units.format(amount, units.decimals), Savings.currency)} to savings`;
      case 'failed':
        return Savings.depositFailedMessage;
      case 'pending':
        return `Deposit sent, still confirming.\n${hash}`;
    }
  }

  static async sendDeposit(
    send: () => Promise<SentVaultCall>,
    vaultCall: VaultCall,
    input: DepositInput,
  ): Promise<{ sent: SentVaultCall; outcome: VaultCallOutcome }> {
    const sent = await send();
    input.clear();
    const outcome = await vaultCall.settle(sent);
    if (outcome === 'failed') {
      input.restore();
    }
    return { sent, outcome };
  }

  static requireDeposit(call: AuthorizedCall, wallet: string, amount: bigint): void {
    if (call.contract !== network.usdcVault || call.method !== 'deposit' || call.args.length !== 4) {
      throw new Error('The transaction is not a deposit into the savings vault');
    }
    const [desired, minimums, from, invest] = call.args.map((arg) => scValToNative(arg)) as unknown[];
    if (!Savings.isSingleAmount(desired) || desired[0] !== amount) {
      throw new Error('The deposit amount does not match the request');
    }
    if (!Savings.isSingleAmount(minimums) || minimums[0] > amount) {
      throw new Error('The deposit minimum is above the amount');
    }
    if (from !== wallet || invest !== true) {
      throw new Error('The deposit does not match the request');
    }
    if (call.nested.length !== 1) {
      throw new Error('The deposit must authorize exactly one USDC transfer');
    }
    Savings.requireVaultTransfer(call.nested[0], wallet, amount);
  }

  private static requireVaultTransfer(call: ContractCall, wallet: string, amount: bigint): void {
    if (call.contract !== network.usdc || call.method !== 'transfer' || call.args.length !== 3) {
      throw new Error('The deposit transfer is not a USDC transfer');
    }
    const [from, to, transferred] = call.args.map((arg) => scValToNative(arg)) as unknown[];
    if (from !== wallet || to !== network.usdcVault || transferred !== amount) {
      throw new Error('The deposit transfer does not match the request');
    }
  }

  private static isSingleAmount(value: unknown): value is [bigint] {
    return Array.isArray(value) && value.length === 1 && typeof value[0] === 'bigint';
  }
}
