import { Networks } from '@stellar/stellar-sdk';

import { loopEnvironment, type StellarNetworkName } from '../environment.ts';

export type PaymentCurrency = 'XLM' | 'XLM.USDC' | 'XLM.EURC' | 'XLM.GBPLOOP';

export const stablePeg: Record<PaymentCurrency, 'USD' | 'EUR' | 'GBP' | null> = {
  XLM: null,
  'XLM.USDC': 'USD',
  'XLM.EURC': 'EUR',
  'XLM.GBPLOOP': 'GBP',
};

export const offeredCurrencies: ReadonlySet<string> = new Set<PaymentCurrency>([
  'XLM',
  'XLM.USDC',
  'XLM.EURC',
  'XLM.GBPLOOP',
]);

export type Token = {
  currency: PaymentCurrency;
  symbol: string;
  contract: string;
};

export const onlyPaymentCurrency: PaymentCurrency | null = null;

export type StellarNetwork = {
  rpcUrls: string[];
  passphrase: string;
  friendbotUrl: string | null;
  factory: string;
  accountWasmHash: string;
  webauthnVerifier: string;
  ed25519Verifier: string;
  payee: string;
  tokens: Token[];
  usdc: string;
  usdcIssuer: string;
  vaults: Partial<Record<PaymentCurrency, string>>;
};

const networks: Record<StellarNetworkName, StellarNetwork> = {
  testnet: {
    rpcUrls: ['https://soroban-testnet.stellar.org', 'https://rpc.ankr.com/stellar_testnet_soroban'],
    passphrase: Networks.TESTNET,
    friendbotUrl: 'https://friendbot.stellar.org',
    factory: 'CCNMXHVK6ODB6GY3Z3ZU5K3RFN5NJ6AQLTVGXUNWTCFVHLACIR2BLLHZ',
    accountWasmHash: 'face137d96aa66bdb43ac600b6b1c8d44f3aac5ed5a6f5f78ce07a25023fa925',
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
    usdcIssuer: 'GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56',
    vaults: {
      'XLM.USDC': 'CBMVK2JK6NTOT2O4HNQAIQFJY232BHKGLIMXDVQVHIIZKDACXDFZDWHN',
    },
  },
  mainnet: {
    rpcUrls: ['https://mainnet.sorobanrpc.com', 'https://soroban-rpc.mainnet.stellar.gateway.fm'],
    passphrase: Networks.PUBLIC,
    friendbotUrl: null,
    factory: 'CCBDANQFVTH3AX3IN7KOWPHAGS44MRWBM6JTPEP3MJFY4MATSD4M2G5S',
    accountWasmHash: 'face137d96aa66bdb43ac600b6b1c8d44f3aac5ed5a6f5f78ce07a25023fa925',
    webauthnVerifier: 'CC23ZMWF6GYHDHD5MBAGJWAIWIHGCFS22D6F7A7O23EDXV7JYZNV2TFP',
    ed25519Verifier: 'CDBAJSZMY2IF22MASUHRIAB3T6CSNIUALSXFIJDIVKD5Z4IZ5T2H4TGT',
    payee: 'GDAEVJPLJZ25BWIHHZ3DW6I53LFH6CFBL7M4VJDKQDIMMSW5YDBRZYSX',
    tokens: [
      { currency: 'XLM', symbol: 'XLM', contract: 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA' },
      { currency: 'XLM.USDC', symbol: 'USDC', contract: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75' },
      { currency: 'XLM.EURC', symbol: 'EURC', contract: 'CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV' },
      { currency: 'XLM.GBPLOOP', symbol: 'GBPLOOP', contract: 'CCU2SGN67UX2TI4KTZGGY457LBYBEPTWO5PMFTWELVUQLU5OEJEWSVNO' },
    ],
    usdc: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
    usdcIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    vaults: {
      'XLM.USDC': 'CAJ2L33QVORJFSFCZYMXN7KU7E3TDVGXCLNHXUX64RJZNT4XYZJUA4WY',
      'XLM.GBPLOOP': 'CCMSIXASOCYJZDZQKSWYLPTW2GG6ONBWNL4NG4P6T6RYLUZXQIH4BIBF',
    },
  },
};

export const network = networks[loopEnvironment.stellarNetwork];

export const offeredTokens = network.tokens.filter((token) => offeredCurrencies.has(token.currency));
