import type { BuiltTransaction, SignedTransaction, SmartWalletIntent, SponsoredResult } from '../ctx/client.ts';
import { base64 } from './base64.ts';
import { DeviceRotation } from './device-rotation.ts';
import type { PasskeyAssertion } from './passkey-assertion.ts';
import { SponsoredCall } from './sponsored-call.ts';
import { WalletRules, type ContextRule } from './wallet-rules.ts';

export type DeviceLinkDeps = {
  createDeviceKey(): Promise<string>;
  buildTransaction(intent: SmartWalletIntent): Promise<BuiltTransaction>;
  sponsorTransaction(intent: SmartWalletIntent, signed: SignedTransaction): Promise<SponsoredResult>;
  signWithPasskey(challenge: Uint8Array): Promise<PasskeyAssertion>;
  latestLedger(): Promise<number>;
  deviceRule(): Promise<ContextRule>;
  sleep(ms: number): Promise<void>;
};

export class DeviceLink {
  static readonly passkeyRuleId = 0;
  static readonly pollMs = 2_000;

  private readonly deps: DeviceLinkDeps;

  constructor(deps: DeviceLinkDeps) {
    this.deps = deps;
  }

  async add(wallet: string, passkeyPublicKey: Uint8Array, signal?: AbortSignal): Promise<void> {
    const newDevicePublicKey = await this.deps.createDeviceKey();
    const newKey = base64.decode(newDevicePublicKey);
    const intent: SmartWalletIntent = { intent: 'rotate_device', newDevicePublicKey };
    const built = await this.deps.buildTransaction(intent);
    const call = SponsoredCall.verify(built, wallet, [DeviceLink.passkeyRuleId], await this.deps.latestLedger());
    DeviceRotation.require(call, wallet, newKey);
    const assertion = await this.deps.signWithPasskey(call.digest);
    assertion.requireSigned(call.digest, passkeyPublicKey);
    const result = await this.deps.sponsorTransaction(intent, {
      transaction: built.transaction,
      passkey: assertion.toJson(passkeyPublicKey),
    });
    if (result.error || result.status === 'failed') {
      throw new Error(result.error || 'Setting up this device failed. Try again.');
    }
    await this.waitForDeviceRule(newKey, built.expiryLedger, signal);
  }

  private async waitForDeviceRule(newKey: Uint8Array, expiryLedger: number, signal?: AbortSignal): Promise<void> {
    while (!signal?.aborted) {
      const landed = await this.deps.deviceRule().then(
        (rule) => WalletRules.holdsDeviceKey(rule, newKey),
        () => false,
      );
      if (landed) {
        return;
      }
      const latest = await this.deps.latestLedger().catch(() => expiryLedger);
      if (latest > expiryLedger) {
        throw new Error('Setting up this device timed out. Try again.');
      }
      await this.deps.sleep(DeviceLink.pollMs);
    }
    throw new Error('Setting up this device was interrupted.');
  }
}
