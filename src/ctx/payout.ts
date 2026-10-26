import type { PayoutJson } from './client.ts';

export const payoutStatuses = [
  'pending-approval',
  'approved',
  'held',
  'pending',
  'submitted',
  'queued',
  'complete',
  'failed',
  'rejected',
  'cancelled',
] as const;

export type PayoutStatus = (typeof payoutStatuses)[number];

export const terminalPayoutStatuses: readonly PayoutStatus[] = ['complete', 'rejected', 'cancelled'];

export class Payout {
  readonly id: string;
  readonly kind: 'wallet' | 'savings';
  readonly status: PayoutStatus;
  readonly currency: string;
  readonly amount: string;
  readonly retryAt?: string;
  readonly reservationTransferId?: string;
  readonly reversalTransferId?: string;

  constructor(json: PayoutJson) {
    this.id = json.id;
    this.kind = json.kind ?? 'wallet';
    this.status = json.status;
    this.currency = json.currency;
    this.amount = json.amount;
    this.retryAt = json.retryAt;
    this.reservationTransferId = json.reservationTransferId;
    this.reversalTransferId = json.reversalTransferId;
  }

  isTerminal(): boolean {
    return terminalPayoutStatuses.includes(this.status);
  }

  isInFlight(): boolean {
    return !this.isTerminal() && Boolean(this.reservationTransferId) && !this.reversalTransferId;
  }

  statusLabel(): string {
    switch (this.status) {
      case 'queued':
        return 'retrying';
      case 'failed':
        return 'delayed, contact support';
      default:
        return 'on the way';
    }
  }

  destinationLabel(): string {
    return this.kind === 'savings' ? 'to savings' : 'to wallet';
  }
}
