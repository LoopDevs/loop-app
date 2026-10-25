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

import { network } from '@/stellar/network';

const simulationSource = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

class Soroban {
  private readonly server = new rpc.Server(network.rpcUrl);

  async read(contractId: string, method: string, args: xdr.ScVal[] = []): Promise<unknown> {
    const transaction = new TransactionBuilder(new Account(simulationSource, '0'), {
      fee: BASE_FEE,
      networkPassphrase: network.passphrase,
    })
      .addOperation(new Contract(contractId).call(method, ...args))
      .setTimeout(30)
      .build();
    const simulated = await this.server.simulateTransaction(transaction);
    if (rpc.Api.isSimulationError(simulated)) {
      throw new Error(`${method} failed: ${simulated.error}`);
    }
    return simulated.result ? scValToNative(simulated.result.retval) : undefined;
  }

  async balance(contractId: string, owner: string): Promise<bigint> {
    return (await this.read(contractId, 'balance', [new Address(owner).toScVal()])) as bigint;
  }

  async wasmHash(contractId: string): Promise<string> {
    const { entries } = await this.server.getLedgerEntries(new Contract(contractId).getFootprint());
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

export const soroban = new Soroban();
