import assert from 'node:assert/strict';
import { test } from 'node:test';

import { WalletCreation } from './wallet-creation.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('settled waits for the pending creation of the same user', async () => {
  const creation = new WalletCreation<string>();
  const deploy = deferred<string>();
  creation.start('user-1', deploy.promise);
  let done = false;
  const waiting = creation.settled('user-1').then(() => {
    done = true;
  });
  await Promise.resolve();
  assert.equal(done, false);
  deploy.resolve('wallet');
  await waiting;
  assert.equal(done, true);
});

test('settled ignores a creation for another user', async () => {
  const creation = new WalletCreation<string>();
  creation.start('user-1', new Promise<string>(() => undefined));
  await creation.settled('user-2');
});

test('settled passes a failed creation on, then forgets it', async () => {
  const creation = new WalletCreation<string>();
  const deploy = deferred<string>();
  creation.start('user-1', deploy.promise);
  deploy.reject(new Error('deploy failed'));
  await assert.rejects(creation.settled('user-1'), /deploy failed/);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await creation.settled('user-1');
});

test('a newer creation replaces the pending one', async () => {
  const creation = new WalletCreation<string>();
  const first = deferred<string>();
  creation.start('user-1', first.promise);
  creation.start('user-1', Promise.resolve('second'));
  first.reject(new Error('first failed'));
  await creation.settled('user-1');
});
