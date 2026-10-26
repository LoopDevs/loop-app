export type StellarNetworkName = 'testnet' | 'mainnet';

export type EnvironmentName = 'staging' | 'production';

const definitions: Record<
  EnvironmentName,
  { ctxApiUrl: string; stellarNetwork: StellarNetworkName; passkeyLabelSuffix: string }
> = {
  staging: { ctxApiUrl: 'https://staging.spend.ctx.com', stellarNetwork: 'testnet', passkeyLabelSuffix: ' (test)' },
  production: { ctxApiUrl: 'https://spend.ctx.com', stellarNetwork: 'mainnet', passkeyLabelSuffix: '' },
};

export class LoopEnvironment {
  readonly name: EnvironmentName;
  readonly ctxApiUrl: string;
  readonly stellarNetwork: StellarNetworkName;

  private constructor(name: EnvironmentName) {
    this.name = name;
    this.ctxApiUrl = definitions[name].ctxApiUrl;
    this.stellarNetwork = definitions[name].stellarNetwork;
  }

  static resolve(value: string | undefined): LoopEnvironment {
    if (value === 'staging' || value === 'production') {
      return new LoopEnvironment(value);
    }
    const allowed = Object.keys(definitions).join(' | ');
    throw new Error(`EXPO_PUBLIC_LOOP_ENV must be ${allowed}, got ${value === undefined ? 'nothing' : JSON.stringify(value)}`);
  }

  storageKey(key: string): string {
    return `${key}.${this.name}`;
  }

  passkeyLabel(label: string): string {
    return `${label}${definitions[this.name].passkeyLabelSuffix}`;
  }
}

export const loopEnvironment = LoopEnvironment.resolve(process.env.EXPO_PUBLIC_LOOP_ENV);
