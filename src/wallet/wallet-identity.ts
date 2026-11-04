import type { PasskeyAssertion } from './passkey-assertion.ts';

export type WalletIdentityDeps = {
  signWithPasskey(challenge: Uint8Array): Promise<PasskeyAssertion>;
  addressOf(credentialId: Uint8Array): Promise<string>;
};

export class WalletIdentity {
  static readonly notYoursMessage =
    "Loop couldn't confirm this wallet is yours. Try again and pick the sign-in you made for Loop.";

  private readonly address: string;
  private readonly deps: WalletIdentityDeps;

  constructor(address: string, deps: WalletIdentityDeps) {
    this.address = address;
    this.deps = deps;
  }

  async prove(challenge: Uint8Array, passkeyPublicKey: Uint8Array): Promise<PasskeyAssertion> {
    const assertion = await this.deps.signWithPasskey(challenge);
    assertion.requireSigned(challenge, passkeyPublicKey);
    if (!assertion.credentialId || (await this.deps.addressOf(assertion.credentialId)) !== this.address) {
      throw new Error(WalletIdentity.notYoursMessage);
    }
    return assertion;
  }
}
