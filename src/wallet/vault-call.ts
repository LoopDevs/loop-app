import type { SponsoredResult } from '../ctx/client.ts';
import { CtxError } from '../ctx/ctx-error.ts';
import { chainOutcome } from '../ctx/payment-state.ts';

export type PendingVaultCall = {
  hash: string;
  expiryLedger: number;
};

export type SentVaultCall = SponsoredResult & { expiryLedger: number };

export type ChainTransaction = {
  status: string;
  latestLedger: number;
};

export type VaultCallOutcome = 'pending' | 'success' | 'failed';

export type VaultCallChain = {
  transaction(hash: string): Promise<ChainTransaction>;
  latestLedger(): Promise<number>;
  sleep(ms: number): Promise<void>;
  now(): number;
};

export class VaultCall {
  static readonly confirmTimeoutMs = 30_000;
  static readonly confirmPollMs = 2_000;

  readonly chain: VaultCallChain;

  constructor(chain: VaultCallChain) {
    this.chain = chain;
  }

  static outcomeOf(transaction: ChainTransaction, call: PendingVaultCall): VaultCallOutcome {
    if (transaction.status === 'NOT_FOUND' && transaction.latestLedger > call.expiryLedger) {
      return 'failed';
    }
    return chainOutcome(transaction.status);
  }

  static refusedBySponsor(error: unknown): error is CtxError {
    return error instanceof CtxError && error.status >= 400 && error.status < 500;
  }

  async settle(sent: SentVaultCall): Promise<VaultCallOutcome> {
    if (sent.error || sent.status === 'failed' || !sent.hash) {
      return 'failed';
    }
    return this.confirm({ hash: sent.hash, expiryLedger: sent.expiryLedger });
  }

  async confirm(call: PendingVaultCall): Promise<VaultCallOutcome> {
    const deadline = this.chain.now() + VaultCall.confirmTimeoutMs;
    for (;;) {
      const status = await this.status(call);
      if (status !== 'pending' || this.chain.now() >= deadline) {
        return status;
      }
      await this.chain.sleep(VaultCall.confirmPollMs);
    }
  }

  status(call: PendingVaultCall): Promise<VaultCallOutcome> {
    if (!call.hash) {
      return this.unansweredStatus(call);
    }
    return this.chain.transaction(call.hash).then(
      (transaction) => VaultCall.outcomeOf(transaction, call),
      () => 'pending' as const,
    );
  }

  private async unansweredStatus(call: PendingVaultCall): Promise<VaultCallOutcome> {
    try {
      return (await this.chain.latestLedger()) > call.expiryLedger ? 'failed' : 'pending';
    } catch {
      return 'pending';
    }
  }
}
