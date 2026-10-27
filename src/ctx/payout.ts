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

export type PayoutKind = 'wallet' | 'savings';

export type PayoutJson = {
  id: string;
  kind?: PayoutKind;
  status: PayoutStatus;
  currency: string;
  amount: string;
  address?: string;
  sentAmount?: string;
  txHash?: string;
  retryAt?: string;
  reservationTransferId?: string;
  reversalTransferId?: string;
};

export class Payout {
  static readonly terminalStatuses: readonly PayoutStatus[] = ['complete', 'rejected', 'cancelled'];

  readonly id: string;
  readonly kind: PayoutKind;
  readonly status: PayoutStatus;
  readonly currency: string;
  readonly amount: string;
  readonly address?: string;
  readonly sentAmount?: string;
  readonly txHash?: string;
  readonly retryAt?: string;
  readonly reservationTransferId?: string;
  readonly reversalTransferId?: string;

  constructor(json: PayoutJson) {
    this.id = json.id;
    this.kind = json.kind ?? 'wallet';
    this.status = json.status;
    this.currency = json.currency;
    this.amount = json.amount;
    this.address = json.address;
    this.sentAmount = json.sentAmount;
    this.txHash = json.txHash;
    this.retryAt = json.retryAt;
    this.reservationTransferId = json.reservationTransferId;
    this.reversalTransferId = json.reversalTransferId;
  }

  isTerminal(): boolean {
    return Payout.terminalStatuses.includes(this.status);
  }

  isInFlight(): boolean {
    return !this.isTerminal() && Boolean(this.reservationTransferId) && !this.reversalTransferId;
  }

  netAmount(): string {
    return this.sentAmount ?? this.amount;
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
