import { Networks } from '@stellar/stellar-sdk';

export type PaymentCurrency = 'XLM' | 'XLM.USDC' | 'XLM.EURC' | 'XLM.GBPLOOP';

export const stablePeg: Record<PaymentCurrency, 'USD' | 'EUR' | 'GBP' | null> = {
  XLM: null,
  'XLM.USDC': 'USD',
  'XLM.EURC': 'EUR',
  'XLM.GBPLOOP': 'GBP',
};

export type Token = {
  currency: PaymentCurrency;
  symbol: string;
  contract: string;
};

export type StellarNetwork = {
  rpcUrl: string;
  passphrase: string;
  friendbotUrl: string | null;
  factory: string;
  accountWasmHash: string;
  webauthnVerifier: string;
  ed25519Verifier: string;
  payee: string;
  tokens: Token[];
  usdc: string;
  usdcVault: string;
};

const networks: Record<'testnet' | 'mainnet', StellarNetwork> = {
  testnet: {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    passphrase: Networks.TESTNET,
    friendbotUrl: 'https://friendbot.stellar.org',
    factory: 'CCNMXHVK6ODB6GY3Z3ZU5K3RFN5NJ6AQLTVGXUNWTCFVHLACIR2BLLHZ',
    accountWasmHash: 'de8d8b4f80ef1d45814fcb54d8d713216a00a29e8f6a6e87f3e26256494eed53',
    webauthnVerifier: 'CA3VX2NQOUKS4DS6HUQMVW7RIXLXJFCOHBH3337S2BA5W2G7EVS7FGLO',
    ed25519Verifier: 'CARD6VOKOMSZRLHMQB66J3Q3HVY3SYHSK72HNRO4R2YXQ4VKTFEFUGJT',
    payee: 'GAYHOZUORLQYLH6N5BX56TXEOIGJCITMZPLFUS7GUEZEIITDQP224LNG',
    tokens: [
      { currency: 'XLM', symbol: 'XLM', contract: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC' },
      { currency: 'XLM.USDC', symbol: 'USDC', contract: 'CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU' },
      { currency: 'XLM.EURC', symbol: 'EURC', contract: 'CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ' },
      { currency: 'XLM.GBPLOOP', symbol: 'GBPLOOP', contract: 'CBSQZMHXIRMRAFCE2FRDDZOSNFH5WKJO4Z6G4KMH4RLXZWHI6UYTVUWM' },
    ],
    usdc: 'CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU',
    usdcVault: 'CBMVK2JK6NTOT2O4HNQAIQFJY232BHKGLIMXDVQVHIIZKDACXDFZDWHN',
  },
  mainnet: {
    rpcUrl: 'https://mainnet.sorobanrpc.com',
    passphrase: Networks.PUBLIC,
    friendbotUrl: null,
    factory: 'CCBDANQFVTH3AX3IN7KOWPHAGS44MRWBM6JTPEP3MJFY4MATSD4M2G5S',
    accountWasmHash: 'de8d8b4f80ef1d45814fcb54d8d713216a00a29e8f6a6e87f3e26256494eed53',
    webauthnVerifier: 'CC23ZMWF6GYHDHD5MBAGJWAIWIHGCFS22D6F7A7O23EDXV7JYZNV2TFP',
    ed25519Verifier: 'CDBAJSZMY2IF22MASUHRIAB3T6CSNIUALSXFIJDIVKD5Z4IZ5T2H4TGT',
    payee: 'GDAEVJPLJZ25BWIHHZ3DW6I53LFH6CFBL7M4VJDKQDIMMSW5YDBRZYSX',
    tokens: [
      { currency: 'XLM', symbol: 'XLM', contract: 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA' },
      { currency: 'XLM.USDC', symbol: 'USDC', contract: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75' },
      { currency: 'XLM.EURC', symbol: 'EURC', contract: 'CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV' },
    ],
    usdc: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
    usdcVault: 'CCUZC3HC5TH2VCYZFUG57E6IGKPL45YUN2SI3UEYQUBA7RCYHUIZBSFV',
  },
};

export const network = networks[process.env.EXPO_PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'];
