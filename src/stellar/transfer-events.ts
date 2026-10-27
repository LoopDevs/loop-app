import { Address, nativeToScVal, type rpc } from '@stellar/stellar-sdk';

export type LedgerRange = {
  startLedger: number;
  endLedger: number;
};

export type TransferEvent = {
  value: unknown;
  txHash: string;
  closedAt: number;
};

export class TransferEvents {
  static request(contractId: string, from: string, to: string, ledgers: LedgerRange): rpc.Api.GetEventsRequest {
    const topics = [
      nativeToScVal('transfer', { type: 'symbol' }),
      new Address(from).toScVal(),
      new Address(to).toScVal(),
    ].map((topic) => topic.toXDR('base64'));
    return {
      ...ledgers,
      filters: [{ type: 'contract', contractIds: [contractId], topics: [topics, [...topics, '*']] }],
    };
  }
}
