import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Asset } from '@stellar/stellar-sdk';

import { network, networks, offeredCurrencies, offeredTokens } from './network.ts';

const contractOf = (name: 'testnet' | 'mainnet', currency: string) =>
  networks[name].tokens.find((token) => token.currency === currency)?.contract;

for (const name of ['testnet', 'mainnet'] as const) {
  test(`the ${name} lumen and dollar token contracts are the ones their assets derive`, () => {
    const { passphrase, usdcIssuer } = networks[name];
    assert.equal(contractOf(name, 'XLM'), Asset.native().contractId(passphrase));
    assert.equal(contractOf(name, 'XLM.USDC'), new Asset('USDC', usdcIssuer).contractId(passphrase));
  });

  test(`every ${name} vault is for a token the network lists`, () => {
    for (const currency of Object.keys(networks[name].vaults)) {
      assert.ok(contractOf(name, currency), currency);
    }
  });
}

test('the mainnet table pins the public network, Circle dollars and the production payee', () => {
  const { mainnet } = networks;
  assert.equal(mainnet.passphrase, 'Public Global Stellar Network ; September 2015');
  assert.equal(mainnet.friendbotUrl, null);
  assert.equal(mainnet.usdcIssuer, 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN');
  assert.equal(mainnet.payee, 'GDAEVJPLJZ25BWIHHZ3DW6I53LFH6CFBL7M4VJDKQDIMMSW5YDBRZYSX');
  assert.equal(mainnet.factory, 'CCBDANQFVTH3AX3IN7KOWPHAGS44MRWBM6JTPEP3MJFY4MATSD4M2G5S');
  assert.equal(
    contractOf('mainnet', 'XLM.EURC'),
    new Asset('EURC', 'GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2').contractId(mainnet.passphrase),
  );
  for (const url of mainnet.rpcUrls) {
    assert.doesNotMatch(url, /testnet/);
  }
});

test('the network lists distinct https RPC endpoints to fail over between', () => {
  assert.ok(network.rpcUrls.length >= 2);
  assert.equal(new Set(network.rpcUrls).size, network.rpcUrls.length);
  for (const url of network.rpcUrls) {
    assert.equal(new URL(url).protocol, 'https:');
  }
});

test('offered tokens are the network tokens on the offered list', () => {
  assert.deepEqual(
    offeredTokens.map((token) => token.currency),
    network.tokens.map((token) => token.currency).filter((currency) => offeredCurrencies.has(currency)),
  );
  assert.ok(offeredTokens.length > 0);
});
