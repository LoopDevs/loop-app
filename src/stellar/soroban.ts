import { bytesToHex } from '@noble/hashes/utils';
import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';

import { Deadline } from '../ctx/deadline.ts';
import { network } from './network.ts';
import { TransferEvents, type LedgerRange, type TransferSearchResult } from './transfer-events.ts';

const simulationSource = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

export class Soroban {
  static readonly hedgeMs = 1000;

  private readonly servers: rpc.Server[];
  private readonly hedgeMs: number;
  private preferred = 0;

  constructor(servers: rpc.Server[], hedgeMs = Soroban.hedgeMs) {
    this.servers = servers;
    this.hedgeMs = hedgeMs;
  }

  static forUrls(urls: string[]): Soroban {
    return new Soroban(urls.map((url) => new rpc.Server(url, { timeout: Deadline.requestMs })));
  }

  private call<T>(request: (server: rpc.Server) => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const count = this.servers.length;
      let started = 0;
      let failed = 0;
      let settled = false;
      let hedge: ReturnType<typeof setTimeout> | undefined;
      const settle = (outcome: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(hedge);
        outcome();
      };
      const start = () => {
        clearTimeout(hedge);
        const index = (this.preferred + started) % count;
        started += 1;
        if (started < count) {
          hedge = setTimeout(start, this.hedgeMs);
        }
        request(this.servers[index]).then(
          (result) =>
            settle(() => {
              this.preferred = index;
              resolve(result);
            }),
          (error: unknown) => {
            if (!(error instanceof Error)) {
              settle(() => reject(error));
              return;
            }
            failed += 1;
            if (failed === count) {
              settle(() => reject(error));
            } else if (started < count && !settled) {
              start();
            }
          },
        );
      };
      start();
    });
  }

  async latestLedger(): Promise<number> {
    const { sequence } = await this.call((server) => server.getLatestLedger());
    return sequence;
  }

  async retention(): Promise<{ oldestLedger: number; latestLedger: number }> {
    const { oldestLedger, latestLedger } = await this.call((server) => server.getHealth());
    return { oldestLedger, latestLedger };
  }

  async read(contractId: string, method: string, args: xdr.ScVal[] = []): Promise<unknown> {
    const transaction = new TransactionBuilder(new Account(simulationSource, '0'), {
      fee: BASE_FEE,
      networkPassphrase: network.passphrase,
    })
      .addOperation(new Contract(contractId).call(method, ...args))
      .setTimeout(30)
      .build();
    const simulated = await this.call((server) => server.simulateTransaction(transaction));
    if (rpc.Api.isSimulationError(simulated)) {
      throw new Error(`${method} failed: ${simulated.error}`);
    }
    return simulated.result ? scValToNative(simulated.result.retval) : undefined;
  }

  async balance(contractId: string, owner: string): Promise<bigint> {
    return (await this.read(contractId, 'balance', [new Address(owner).toScVal()])) as bigint;
  }

  async transaction(hash: string): Promise<{ status: string; latestLedger: number }> {
    const { status, latestLedger } = await this.call((server) => server.getTransaction(hash));
    return { status, latestLedger };
  }

  async transfers(contractId: string, from: string, to: string, ledgers: LedgerRange): Promise<TransferSearchResult> {
    const { events, latestLedger } = await this.call((server) =>
      server.getEvents(TransferEvents.request(contractId, from, to, ledgers)),
    );
    return {
      transfers: events.map((event) => ({
        value: scValToNative(event.value),
        txHash: event.txHash,
        closedAt: Date.parse(event.ledgerClosedAt),
      })),
      latestLedger,
    };
  }

  async wasmHash(contractId: string): Promise<string> {
    const { entries } = await this.call((server) => server.getLedgerEntries(new Contract(contractId).getFootprint()));
    if (entries.length === 0) {
      throw new Error(`Contract ${contractId} does not exist`);
    }
    const data = entries[0].val;
    if (data.type !== 'contractData' || data.contractData.val.type !== 'scvContractInstance') {
      throw new Error(`Contract ${contractId} has no instance`);
    }
    const { executable } = data.contractData.val.instance;
    if (executable.type !== 'contractExecutableWasm') {
      throw new Error(`Contract ${contractId} is not a wasm contract`);
    }
    return bytesToHex(executable.wasmHash.value);
  }
}

export function i128(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: 'i128' });
}

export const soroban = Soroban.forUrls(network.rpcUrls);
