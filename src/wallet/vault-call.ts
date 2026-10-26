import type { SponsoredResult } from '../ctx/client.ts';
import { sentTransactionOutcome, type ChainTransaction } from '../ctx/payment-state.ts';

export type SentVaultCall = SponsoredResult & { expiryLedger: number };

export type PendingVaultCall = {
  hash: string;
  expiryLedger: number;
};

export type VaultCallOutcome = 'pending' | 'success' | 'failed';

export type VaultCallChain = {
  transaction(hash: string): Promise<ChainTransaction>;
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

  async confirm(call: PendingVaultCall): Promise<VaultCallOutcome> {
    const deadline = this.chain.now() + VaultCall.confirmTimeoutMs;
    for (;;) {
      const status = await this.chain.transaction(call.hash).then(
        (transaction) => sentTransactionOutcome(transaction, call.expiryLedger),
        () => 'pending' as const,
      );
      if (status !== 'pending' || this.chain.now() >= deadline) {
        return status;
      }
      await this.chain.sleep(VaultCall.confirmPollMs);
    }
  }
}
