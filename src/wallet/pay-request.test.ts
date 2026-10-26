import assert from 'node:assert/strict';
import { test } from 'node:test';

import { network } from '../stellar/network.ts';
import { PayRequest } from './pay-request.ts';

const destination = 'CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU';

test('a pay request names the destination, amount and dollar asset', () => {
  const uri = new PayRequest(destination, '25').uri();
  assert.equal(
    uri,
    `web+stellar:pay?destination=${destination}&amount=25&asset_code=USDC&asset_issuer=${network.usdcIssuer}`,
  );
});

test('a pay request without an amount leaves it to the paying app', () => {
  const params = new URLSearchParams(new PayRequest(destination).uri().split('?')[1]);
  assert.equal(params.has('amount'), false);
  assert.equal(params.get('destination'), destination);
});
