import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bytesToHex } from '@noble/hashes/utils';
import { Address, Networks, xdr } from '@stellar/stellar-sdk';

import { network } from '../stellar/network.ts';
import { DeviceRotation } from './device-rotation.ts';
import {
  latestLedger,
  otherWallet,
  passkeyRule,
  rotationBuilt,
  wallet,
  type RotationShape,
} from './rotation.fixture.ts';
import { SponsoredCall } from './sponsored-call.ts';

const newKey = new Uint8Array(32).fill(7);
const otherKey = new Uint8Array(32).fill(8);
const knownDigest = '126fcf0a00a01e418e0d23596aca0980fe144866ddf344471b99d7ab2f982b62';

function rotation(shape: RotationShape = {}): SponsoredCall {
  return SponsoredCall.verify(rotationBuilt(newKey, shape), wallet, passkeyRule, latestLedger);
}

test('the testnet rotation verifies against a fixed known digest', { skip: network.passphrase !== Networks.TESTNET }, () => {
  const built = { ...rotationBuilt(newKey), digest: knownDigest };
  assert.equal(bytesToHex(SponsoredCall.verify(built, wallet, passkeyRule, latestLedger).digest), knownDigest);
});

test('a rotation of this wallet to the new device key is accepted', () => {
  assert.doesNotThrow(() => DeviceRotation.require(rotation(), wallet, newKey));
});

test('a rotation to a different key is refused', () => {
  assert.throws(() => DeviceRotation.require(rotation(), wallet, otherKey), /different key/);
  const rotationToOther = rotation({ args: [xdr.ScVal.scvBytes(Buffer.from(otherKey))] });
  assert.throws(() => DeviceRotation.require(rotationToOther, wallet, newKey), /different key/);
});

test('a rotation key that is not raw bytes is refused', () => {
  const asString = rotation({ args: [xdr.ScVal.scvString(Buffer.from(newKey))] });
  assert.throws(() => DeviceRotation.require(asString, wallet, newKey), /different key/);
});

test('a call on a different wallet is refused', () => {
  assert.throws(() => DeviceRotation.require(rotation({ contract: otherWallet }), wallet, newKey), /different wallet/);
});

test('another function on the wallet is refused', () => {
  const recovery = rotation({ method: 'recovery_cancel', args: [new Address(wallet).toScVal()] });
  assert.throws(() => DeviceRotation.require(recovery, wallet, newKey), /not a device change/);
  const extraArg = rotation({ args: [xdr.ScVal.scvBytes(Buffer.from(newKey)), xdr.ScVal.scvU32(1)] });
  assert.throws(() => DeviceRotation.require(extraArg, wallet, newKey), /not a device change/);
});
