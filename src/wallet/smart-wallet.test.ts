import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { xdr } from '@stellar/stellar-sdk';

import { BuyTimer, type BuyStep } from '../ctx/buy-timer.ts';
import { ctx, type GiftCard, type SmartWalletIntent, type WalletLink } from '../ctx/client.ts';
import { secureTokenStorage } from '../session/secure-token-storage.ts';
import { network } from '../stellar/network.ts';
import { soroban } from '../stellar/soroban.ts';
import { base64 } from './base64.ts';
import { DeviceLink } from './device-link.ts';
import { MissingDeviceSecret } from './device-key.ts';
import { deviceSigner } from './device-signer.ts';
import { Holdings } from './holdings.ts';
import { passkey } from './passkey.ts';
import { Savings } from './savings.ts';
import { SmartWallet, UnlinkedDevice } from './smart-wallet.ts';
import { SponsoredCall } from './sponsored-call.ts';
import { WalletPin } from './wallet-pin.ts';
import type { ContextRule } from './wallet-rules.ts';

const userId = 'user-1';
const address = network.factory;
const passkeyKey = new Uint8Array(65).fill(4);
const deviceKey = new Uint8Array(32).fill(1);
const otherDeviceKey = new Uint8Array(32).fill(2);
const link: WalletLink = { id: 'w1', chain: 'XLM', address, sponsored: true, status: 'active' };

type Restore = () => void;

const restores: Restore[] = [];

function replace<T extends object, K extends keyof T>(target: T, key: K, value: unknown): void {
  const original = target[key];
  (target as Record<K, unknown>)[key] = value;
  restores.push(() => {
    (target as Record<K, unknown>)[key] = original;
  });
}

type Chain = {
  deviceKeyOnRule: Uint8Array;
  deviceKeyOnPhone: string | null;
  ledger: number;
  shareValue: bigint;
  shares: bigint;
  gbpShareValue: bigint;
  gbpShares: bigint;
};

const gbpVault = 'CGBPLOOPVAULT';

let chain: Chain;
let links: WalletLink[];
let calls: string[];

function contextRule(id: number): ContextRule {
  return id === 0
    ? { id, signers: [['External', network.webauthnVerifier, passkeyKey]], valid_until: undefined }
    : { id, signers: [['External', network.ed25519Verifier, chain.deviceKeyOnRule]], valid_until: undefined };
}

const pinnedUsers = [userId, 'user-2'];

function pinFor(user: string): WalletPin {
  return new WalletPin(secureTokenStorage, user, async () => user);
}

function pinned(): Promise<string | null> {
  return secureTokenStorage.getItem(pinFor(userId).key);
}

async function clearPins(): Promise<void> {
  for (const user of pinnedUsers) {
    await secureTokenStorage.removeItem(pinFor(user).key);
    await secureTokenStorage.removeItem(pinFor(user).pendingKey);
  }
}

async function pinWallet(user: string, key: Uint8Array = passkeyKey): Promise<void> {
  await pinFor(user).write({ address, passkeyPublicKey: base64.encode(key) });
}

async function leavePendingPasskey(key: Uint8Array = passkeyKey): Promise<void> {
  await secureTokenStorage.setItem(
    pinFor(userId).pendingKey,
    JSON.stringify({ credentialId: 'cred-1', publicKey: base64.encode(key) }),
  );
}

beforeEach(async () => {
  chain = {
    deviceKeyOnRule: deviceKey,
    deviceKeyOnPhone: base64.encode(deviceKey),
    ledger: 1_000,
    shareValue: 0n,
    shares: 0n,
    gbpShareValue: 0n,
    gbpShares: 0n,
  };
  network.vaults['XLM.GBPLOOP'] = gbpVault;
  links = [link];
  calls = [];
  await clearPins();
  await pinWallet(userId);
  replace(ctx, 'userId', async () => userId);
  replace(ctx, 'wallets', async () => links);
  replace(soroban, 'wasmHash', async () => network.accountWasmHash);
  replace(soroban, 'latestLedger', async () => chain.ledger);
  replace(soroban, 'balance', async (contract: string) => {
    if (contract === Savings.vault('XLM.USDC')) {
      return chain.shares;
    }
    return contract === gbpVault ? chain.gbpShares : 7n;
  });
  replace(soroban, 'read', async (contract: string, method: string, args: xdr.ScVal[] = []) => {
    if (method === 'get_context_rules_count') {
      return 2;
    }
    if (method === 'get_context_rule') {
      return contextRule((args[0] as unknown as { u32: number }).u32);
    }
    if (method === 'get_asset_amounts_per_shares') {
      return [contract === gbpVault ? chain.gbpShareValue : chain.shareValue];
    }
    throw new Error(`unexpected read ${method}`);
  });
  replace(deviceSigner, 'publicKey', async () => chain.deviceKeyOnPhone);
});

afterEach(() => {
  delete network.vaults['XLM.GBPLOOP'];
  while (restores.length > 0) {
    restores.pop()?.();
  }
});

test('a wallet-less account loads as no wallet and pins nothing', async () => {
  await clearPins();
  links = [];
  assert.equal(await SmartWallet.load(), null);
  assert.equal(await pinned(), null);
});

test('a pinned wallet that lists this device loads', async () => {
  const wallet = await SmartWallet.load();
  assert.equal(wallet?.id, 'w1');
  assert.equal(wallet?.address, address);
  assert.equal(wallet?.userId, userId);
});

test('a wallet this device neither pinned nor created is an unlinked device and stays unpinned', async () => {
  await clearPins();
  await assert.rejects(SmartWallet.load(), UnlinkedDevice);
  assert.equal(await pinned(), null);
});

test('a wallet that holds the passkey this device created is pinned and the pending passkey is dropped', async () => {
  await clearPins();
  await leavePendingPasskey();
  const wallet = await SmartWallet.load();
  assert.equal(wallet?.address, address);
  assert.deepEqual(JSON.parse((await pinned()) ?? 'null'), {
    address,
    passkeyPublicKey: base64.encode(passkeyKey),
  });
  assert.equal(await secureTokenStorage.getItem(pinFor(userId).pendingKey), null);
});

test('a wallet holding a different passkey than the one this device created is not pinned', async () => {
  await clearPins();
  await leavePendingPasskey(new Uint8Array(65).fill(9));
  await assert.rejects(SmartWallet.load(), UnlinkedDevice);
  assert.equal(await pinned(), null);
});

test('a wallet whose device rule holds another key is an unlinked device and is not pinned', async () => {
  await clearPins();
  await leavePendingPasskey();
  chain.deviceKeyOnRule = otherDeviceKey;
  await assert.rejects(SmartWallet.load(), (error: unknown) => {
    assert.ok(error instanceof UnlinkedDevice);
    assert.equal(error.wallet.address, address);
    return true;
  });
  assert.equal(await pinned(), null);
});

test('a phone with no device key is an unlinked device', async () => {
  chain.deviceKeyOnPhone = null;
  await assert.rejects(SmartWallet.load(), UnlinkedDevice);
});

test('a pinned address the account no longer lists stops the load', async () => {
  await pinFor(userId).write({
    address: 'CPINNED',
    passkeyPublicKey: base64.encode(passkeyKey),
  });
  await assert.rejects(SmartWallet.load(), /doesn't list the wallet created on this device/);
});

test('a pinned wallet is checked against the pinned passkey', async () => {
  await pinWallet(userId, new Uint8Array(65).fill(9));
  await assert.rejects(SmartWallet.load(), /rule 0 holds a different key/);
});

test('an account switch while the wallet loads starts the load again for the new account', async () => {
  await pinWallet('user-2');
  const seen: string[] = [];
  const users = ['user-1', 'user-2', 'user-2', 'user-2'];
  replace(ctx, 'userId', async () => users.shift() ?? 'user-2');
  replace(ctx, 'wallets', async () => {
    seen.push('wallets');
    return links;
  });
  const wallet = await SmartWallet.load();
  assert.equal(wallet?.userId, 'user-2');
  assert.deepEqual(seen, ['wallets']);
});

test('only an unlinked device error is turned into no wallet', () => {
  const wallet = new UnlinkedDevice(undefined as unknown as SmartWallet);
  assert.equal(SmartWallet.unlessUnlinked(wallet), null);
  const failure = new Error('offline');
  assert.throws(() => SmartWallet.unlessUnlinked(failure), failure);
});

test('a wallet is the same only with the same id, address and account', async () => {
  const wallet = (await SmartWallet.load()) as SmartWallet;
  assert.equal(wallet.sameAs(null), false);
  assert.equal(wallet.sameAs(wallet), true);
  const other = { ...wallet, id: 'w2' } as SmartWallet;
  assert.equal(wallet.sameAs(other), false);
  assert.equal(wallet.sameAs({ ...wallet, userId: 'user-2' } as SmartWallet), false);
  assert.equal(wallet.sameAs({ ...wallet, address: 'CELSE' } as SmartWallet), false);
});

test('creating a wallet when one exists changes nothing', async () => {
  replace(ctx, 'deployWallet', async () => {
    calls.push('deploy');
    return link;
  });
  replace(deviceSigner, 'create', async () => {
    calls.push('create key');
    return base64.encode(deviceKey);
  });
  await SmartWallet.create('Loop');
  assert.deepEqual(calls, []);
});

test('creating a wallet makes the device key and passkey, deploys with both and pins the wallet', async () => {
  await clearPins();
  links = [];
  replace(deviceSigner, 'create', async () => {
    calls.push('create key');
    return base64.encode(deviceKey);
  });
  replace(passkey, 'create', async (label: string) => {
    calls.push(`passkey ${label}`);
    return { credentialId: 'cred-1', publicKey: passkeyKey };
  });
  let deployed: unknown;
  let deployedFor = '';
  replace(ctx, 'deployWallet', async (user: string, body: unknown) => {
    deployedFor = user;
    deployed = body;
    links = [link];
    return link;
  });
  await SmartWallet.create('a@example.com');
  assert.deepEqual(calls, ['create key', 'passkey a@example.com']);
  assert.equal(deployedFor, userId);
  assert.deepEqual(deployed, {
    credentialId: 'cred-1',
    passkeyPublicKey: base64.encode(passkeyKey),
    devicePublicKey: base64.encode(deviceKey),
  });
  assert.equal((await SmartWallet.load())?.address, address);
  assert.deepEqual(JSON.parse((await pinned()) ?? 'null'), {
    address,
    passkeyPublicKey: base64.encode(passkeyKey),
  });
});

test('a load started during wallet creation waits for the deployment', async () => {
  await clearPins();
  links = [];
  replace(deviceSigner, 'create', async () => base64.encode(deviceKey));
  replace(passkey, 'create', async () => ({ credentialId: 'cred-1', publicKey: passkeyKey }));
  let finishDeploy: () => void = () => undefined;
  replace(
    ctx,
    'deployWallet',
    () =>
      new Promise<WalletLink>((resolve) => {
        finishDeploy = () => {
          links = [link];
          resolve(link);
        };
      }),
  );
  await SmartWallet.create('Loop');
  let loaded = false;
  const loading = SmartWallet.load().then((wallet) => {
    loaded = true;
    return wallet;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(loaded, false);
  finishDeploy();
  assert.equal((await loading)?.address, address);
});

test('a deployed wallet that does not hold this device key fails the load and is not pinned', async () => {
  await clearPins();
  links = [];
  chain.deviceKeyOnRule = otherDeviceKey;
  replace(deviceSigner, 'create', async () => base64.encode(deviceKey));
  replace(passkey, 'create', async () => ({ credentialId: 'cred-1', publicKey: passkeyKey }));
  replace(ctx, 'deployWallet', async () => link);
  const warn = console.warn;
  console.warn = () => undefined;
  try {
    await SmartWallet.create('Loop');
    await assert.rejects(SmartWallet.load(), /The new wallet does not hold this device key/);
  } finally {
    console.warn = warn;
  }
  assert.equal(await pinned(), null);
});

test('balances list each token and skip the vault valuation for no shares', async () => {
  const wallet = (await SmartWallet.load()) as SmartWallet;
  const empty = await wallet.balances();
  assert.deepEqual(
    empty.tokens.map(({ token, amount }) => [token.currency, amount]),
    network.tokens.map((token) => [token.currency, 7n]),
  );
  assert.deepEqual(empty.savings, [
    { currency: 'XLM.USDC', shares: 0n, value: 0n },
    { currency: 'XLM.GBPLOOP', shares: 0n, value: 0n },
  ]);
  chain.shares = 500n;
  chain.shareValue = 650n;
  chain.gbpShares = 20n;
  chain.gbpShareValue = 30n;
  const saved = await wallet.balances();
  assert.deepEqual(saved.savings, [
    { currency: 'XLM.USDC', shares: 500n, value: 650n },
    { currency: 'XLM.GBPLOOP', shares: 20n, value: 30n },
  ]);
});

const giftCard = {
  paymentId: 'pay-1',
  paymentCryptoCurrency: 'XLM.USDC',
  paymentCryptoAmount: '1.5',
  paymentCryptoAddress: 'GORDER',
} as GiftCard;

type PayFakes = {
  verified: { ruleIds: number[]; ledger: number }[];
  expected: { amount: bigint; orderAddress: string | undefined; from: string }[];
  sponsored: { intent: SmartWalletIntent; signed: unknown }[];
};

function fakePayment(): PayFakes {
  const fakes: PayFakes = { verified: [], expected: [], sponsored: [] };
  const call = {
    digest: new Uint8Array([9, 9]),
    requirePayment: (expected: { amount: bigint; orderAddress: string | undefined; from: string }) => {
      fakes.expected.push(expected);
      return { amount: expected.amount };
    },
  };
  replace(SponsoredCall, 'verify', (_built: unknown, _wallet: string, ruleIds: number[], ledger: number) => {
    fakes.verified.push({ ruleIds, ledger });
    return call;
  });
  replace(ctx, 'buildTransaction', async () => ({
    transaction: 'xdr-1',
    digest: 'ab',
    contextRuleIds: [1],
    expiryLedger: 1_050,
  }));
  replace(ctx, 'sponsorTransaction', async (_id: string, intent: SmartWalletIntent, signed: unknown) => {
    fakes.sponsored.push({ intent, signed });
    return { hash: 'tx-1', status: 'PENDING' };
  });
  replace(deviceSigner, 'sign', async () => 'sig-1');
  return fakes;
}

test('a payment is built, verified against the device rule, signed and only sponsored when sent', async () => {
  const wallet = (await SmartWallet.load()) as SmartWallet;
  const fakes = fakePayment();
  const marks: BuyStep[] = [];
  const timer = new BuyTimer(() => 0, () => undefined);
  replace(timer, 'mark', (step: BuyStep) => marks.push(step));
  const payment = await wallet.pay(giftCard, timer);
  assert.deepEqual(fakes.verified, [{ ruleIds: [SmartWallet.deviceRuleId], ledger: 1_000 }]);
  assert.deepEqual(fakes.expected, [{ from: address, token: network.tokens[1], amount: 15_000_000n, orderAddress: 'GORDER' }]);
  assert.deepEqual(marks, ['payment built', 'ledger read', 'signed']);
  assert.equal(payment.expiryLedger, 1_050);
  assert.deepEqual(payment.transfer, { amount: 15_000_000n });
  assert.deepEqual(fakes.sponsored, []);
  const result = await payment.sponsor();
  assert.deepEqual(result, { hash: 'tx-1', status: 'PENDING' });
  assert.deepEqual(fakes.sponsored, [
    {
      intent: { intent: 'pay', paymentId: 'pay-1' },
      signed: { transaction: 'xdr-1', signature: 'sig-1', devicePublicKey: base64.encode(deviceKey) },
    },
  ]);
  assert.deepEqual(marks, ['payment built', 'ledger read', 'signed', 'submitted']);
});

test('an order with no payable Stellar price is refused before anything is built', async () => {
  const wallet = (await SmartWallet.load()) as SmartWallet;
  const fakes = fakePayment();
  for (const card of [
    { ...giftCard, paymentCryptoCurrency: 'BTC' },
    { ...giftCard, paymentCryptoAmount: undefined },
  ]) {
    await assert.rejects(wallet.pay(card as GiftCard), /no Stellar price this wallet can pay/);
  }
  assert.deepEqual(fakes.verified, []);
});

test('a phone without its device key cannot sign a payment', async () => {
  const wallet = (await SmartWallet.load()) as SmartWallet;
  fakePayment();
  chain.deviceKeyOnPhone = null;
  await assert.rejects(wallet.pay(giftCard), /This device has no wallet key/);
});

test('a device key that went missing while signing reads as an unlinked device', async () => {
  const wallet = (await SmartWallet.load()) as SmartWallet;
  fakePayment();
  replace(deviceSigner, 'sign', async () => {
    throw new MissingDeviceSecret();
  });
  await assert.rejects(wallet.pay(giftCard), (error: unknown) => {
    assert.ok(error instanceof UnlinkedDevice);
    assert.equal(error.wallet, wallet);
    return true;
  });
});

test('another signing failure is passed on unchanged', async () => {
  const wallet = (await SmartWallet.load()) as SmartWallet;
  fakePayment();
  replace(deviceSigner, 'sign', async () => {
    throw new Error('identity not confirmed');
  });
  await assert.rejects(wallet.pay(giftCard), /identity not confirmed/);
});

test('a withdrawal asks CTX for the vault withdraw of exactly those shares and sponsors it signed', async () => {
  const wallet = (await SmartWallet.load()) as SmartWallet;
  const fakes = fakePayment();
  const required: bigint[] = [];
  replace(SponsoredCall, 'verify', () => ({
    digest: new Uint8Array([9]),
    requireWithdrawal: ({ shares, vault, from }: { shares: bigint; vault: string; from: string }) => {
      assert.equal(vault, Savings.vault('XLM.USDC'));
      assert.equal(from, address);
      required.push(shares);
      return Holdings.floorOf(1_000n);
    },
  }));
  chain.shareValue = 1_000n;
  let builtIntent: unknown;
  replace(ctx, 'buildTransaction', async (_id: string, intent: unknown) => {
    builtIntent = intent;
    return { transaction: 'xdr-2', digest: 'cd', contextRuleIds: [1], expiryLedger: 1_040 };
  });
  const sent = await wallet.withdraw('XLM.USDC', 250n);
  assert.deepEqual(builtIntent, { intent: 'vault_withdraw', currency: 'XLM.USDC', shares: '250' });
  assert.deepEqual(required, [250n]);
  assert.deepEqual(sent, { hash: 'tx-1', status: 'PENDING', expiryLedger: 1_040 });
  assert.equal(fakes.sponsored.length, 1);
});

test('a withdrawal in another savings currency targets that vault and is valued by it', async () => {
  const wallet = (await SmartWallet.load()) as SmartWallet;
  const fakes = fakePayment();
  const required: { vault: string; shares: bigint }[] = [];
  replace(SponsoredCall, 'verify', () => ({
    digest: new Uint8Array([9]),
    requireWithdrawal: ({ shares, vault }: { shares: bigint; vault: string }) => {
      required.push({ vault, shares });
      return Holdings.floorOf(1_000n);
    },
  }));
  chain.shareValue = 5_000n;
  chain.gbpShareValue = 1_000n;
  let builtIntent: unknown;
  replace(ctx, 'buildTransaction', async (_id: string, intent: unknown) => {
    builtIntent = intent;
    return { transaction: 'xdr-2', digest: 'cd', contextRuleIds: [1], expiryLedger: 1_040 };
  });
  await wallet.withdraw('XLM.GBPLOOP', 40n);
  assert.deepEqual(builtIntent, { intent: 'vault_withdraw', currency: 'XLM.GBPLOOP', shares: '40' });
  assert.deepEqual(required, [{ vault: gbpVault, shares: 40n }]);
  assert.equal(fakes.sponsored.length, 1);
});

test('a withdrawal whose minimum is below the allowed slippage is not signed', async () => {
  const wallet = (await SmartWallet.load()) as SmartWallet;
  const fakes = fakePayment();
  replace(SponsoredCall, 'verify', () => ({
    digest: new Uint8Array([9]),
    requireWithdrawal: () => Holdings.floorOf(1_000n) - 1n,
  }));
  chain.shareValue = 1_000n;
  await assert.rejects(wallet.withdraw('XLM.USDC', 250n), /The withdrawal minimum is too low/);
  assert.deepEqual(fakes.sponsored, []);
});

test('a transaction counts as landed only when the ledger reports success', async () => {
  const wallet = (await SmartWallet.load()) as SmartWallet;
  for (const [status, landed] of [
    ['SUCCESS', true],
    ['NOT_FOUND', false],
    ['FAILED', false],
  ] as const) {
    replace(soroban, 'transaction', async () => ({ status, latestLedger: 1 }));
    assert.equal(await wallet.transactionLanded('hash'), landed, status);
  }
});

test('adding a linked device only refreshes the pin', async () => {
  const wallet = (await SmartWallet.load()) as SmartWallet;
  await clearPins();
  replace(DeviceLink.prototype, 'add', async () => {
    calls.push('add');
  });
  const proven: Uint8Array[] = [];
  replace(passkey, 'sign', async () => ({
    requireSigned: (_challenge: Uint8Array, publicKey: Uint8Array) => {
      proven.push(publicKey);
    },
  }));
  await wallet.addThisDevice();
  assert.deepEqual(calls, []);
  assert.deepEqual(proven, [passkeyKey]);
  assert.equal(JSON.parse((await pinned()) ?? 'null').address, address);
});

test('a linked device is not pinned when the passkey assertion does not verify', async () => {
  const wallet = (await SmartWallet.load()) as SmartWallet;
  await clearPins();
  replace(passkey, 'sign', async () => ({
    requireSigned: () => {
      throw new Error('signature mismatch');
    },
  }));
  await assert.rejects(wallet.addThisDevice(), /signature mismatch/);
  assert.equal(await pinned(), null);
});

test('adding an unlinked device runs the device link with the wallet passkey before pinning', async () => {
  const wallet = (await SmartWallet.load()) as SmartWallet;
  await clearPins();
  chain.deviceKeyOnPhone = null;
  const signal = new AbortController().signal;
  let received: unknown[] = [];
  replace(DeviceLink.prototype, 'add', async (...args: unknown[]) => {
    received = args;
    assert.equal(await pinned(), null);
  });
  await wallet.addThisDevice(signal);
  assert.equal(received[0], address);
  assert.deepEqual(received[1], passkeyKey);
  assert.equal(received[2], signal);
  assert.equal(JSON.parse((await pinned()) ?? 'null').passkeyPublicKey, base64.encode(passkeyKey));
});

test('a failed device link leaves the pin unwritten', async () => {
  const wallet = (await SmartWallet.load()) as SmartWallet;
  await clearPins();
  chain.deviceKeyOnPhone = null;
  replace(DeviceLink.prototype, 'add', async () => {
    throw new Error('cancelled');
  });
  await assert.rejects(wallet.addThisDevice(), /cancelled/);
  assert.equal(await pinned(), null);
});

test('testnet funding calls friendbot for the wallet address and reports a refusal', async () => {
  const wallet = (await SmartWallet.load()) as SmartWallet;
  const realFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    urls.push(String(input));
    return new Response('already funded', { status: 400 });
  }) as typeof fetch;
  try {
    await assert.rejects(wallet.fundWithFriendbot(), /Friendbot 400: already funded/);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(urls, [`${network.friendbotUrl}/?addr=${address}`]);
});
