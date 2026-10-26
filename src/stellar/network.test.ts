import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Asset } from '@stellar/stellar-sdk';

import { network, offeredCurrencies, offeredTokens } from './network.ts';

test('the dollar issuer is the one behind the dollar token contract', () => {
  assert.equal(new Asset('USDC', network.usdcIssuer).contractId(network.passphrase), network.usdc);
});

test('offered tokens are the network tokens on the offered list', () => {
  assert.deepEqual(
    offeredTokens.map((token) => token.currency),
    network.tokens.map((token) => token.currency).filter((currency) => offeredCurrencies.has(currency)),
  );
  assert.ok(offeredTokens.length > 0);
});
