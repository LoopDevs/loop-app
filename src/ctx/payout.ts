export type PayoutJson = {
  id: string;
  status: string;
  currency: string;
  amount: string;
  kind?: string;
  reservationTransferId?: string;
  reversalTransferId?: string;
};

export class Payout {
  static readonly terminalStatuses: readonly string[] = ['complete', 'rejected', 'cancelled'];

  readonly id: string;
  readonly status: string;
  readonly currency: string;
  readonly amount: string;
  readonly kind?: string;
  readonly reservationTransferId?: string;
  readonly reversalTransferId?: string;

  constructor(json: PayoutJson) {
    this.id = json.id;
    this.status = json.status;
    this.currency = json.currency;
    this.amount = json.amount;
    this.kind = json.kind;
    this.reservationTransferId = json.reservationTransferId;
    this.reversalTransferId = json.reversalTransferId;
  }

  isInFlight(): boolean {
    return (
      !Payout.terminalStatuses.includes(this.status) &&
      Boolean(this.reservationTransferId) &&
      !this.reversalTransferId
    );
  }
}
