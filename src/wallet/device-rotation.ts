import { bytesToHex } from '@noble/hashes/utils';
import { scValToNative } from '@stellar/stellar-sdk';

import type { SponsoredCall } from './sponsored-call.ts';

export class DeviceRotation {
  static readonly method = 'rotate_device';

  static require(call: SponsoredCall, wallet: string, newDevicePublicKey: Uint8Array): void {
    if (call.contract !== wallet) {
      throw new Error('The device change targets a different wallet');
    }
    if (call.method !== DeviceRotation.method || call.args.length !== 1) {
      throw new Error('The transaction is not a device change');
    }
    const key: unknown = scValToNative(call.args[0]);
    if (!(key instanceof Uint8Array) || bytesToHex(key) !== bytesToHex(newDevicePublicKey)) {
      throw new Error('The device change names a different key');
    }
  }
}
