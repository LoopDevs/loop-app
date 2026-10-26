import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { MeJson } from './client.ts';
import { Profile } from './profile.ts';

const company = {
  countries: ['US', 'GB', 'CA'],
  stableCurrencies: ['XLM.USDC', 'XLM.GBPLOOP'],
};

const newUser: MeJson = { user: { id: 'u1' }, company };

test('a new user needs setup and a currency choice', () => {
  const profile = Profile.fromMe(newUser);
  assert.equal(profile.needsSetup(), true);
  assert.equal(profile.needsCurrencyChoice(), true);
});

test('the stable currency is sent before the country', () => {
  const profile = Profile.fromMe(newUser);
  assert.deepEqual(profile.nextUpdate({ country: 'GB', stableCurrency: 'XLM.USDC' }), {
    stableCurrency: 'XLM.USDC',
  });
});

test('the country is never sent while the stable currency is unchosen', () => {
  const profile = Profile.fromMe(newUser);
  assert.equal(profile.nextUpdate({ country: 'GB' }), null);
});

test('a stable currency the company does not offer is never sent', () => {
  const profile = Profile.fromMe(newUser);
  assert.equal(profile.nextUpdate({ country: 'GB', stableCurrency: 'XLM.EURC' }), null);
});

test('after the stable currency is saved the country follows', () => {
  const saved = Profile.fromMe(newUser).withUser({ id: 'u1', stableCurrency: 'XLM.USDC' });
  assert.deepEqual(saved.nextUpdate({ country: 'GB', stableCurrency: 'XLM.USDC' }), {
    country: 'GB',
  });
});

test('a user with a stable currency changes country only', () => {
  const profile = Profile.fromMe({
    user: { id: 'u1', country: 'US', stableCurrency: 'XLM.USDC' },
    company,
  });
  assert.equal(profile.needsSetup(), false);
  assert.deepEqual(profile.nextUpdate({ country: 'CA', stableCurrency: 'XLM.GBPLOOP' }), {
    country: 'CA',
  });
});

test('choosing the current country sends nothing', () => {
  const profile = Profile.fromMe({
    user: { id: 'u1', country: 'US', stableCurrency: 'XLM.USDC' },
    company,
  });
  assert.equal(profile.nextUpdate({ country: 'US' }), null);
});

test('a country the company does not cover is never sent', () => {
  const profile = Profile.fromMe({ user: { id: 'u1', stableCurrency: 'XLM.USDC' }, company });
  assert.equal(profile.nextUpdate({ country: 'FR' }), null);
});

test('a company without stable currencies has no currency step', () => {
  const profile = Profile.fromMe({ user: { id: 'u1' }, company: { countries: ['US'] } });
  assert.equal(profile.needsCurrencyChoice(), false);
  assert.equal(profile.needsSetup(), true);
  assert.deepEqual(profile.nextUpdate({ country: 'US' }), { country: 'US' });
});

test('an Apple or Google identity names its provider', () => {
  const profile = Profile.fromMe({
    user: {
      id: 'u1',
      email: 'a@b.co',
      oauthIdentities: [{ provider: 'apple' }, { provider: 'google' }],
    },
    company,
  });
  assert.equal(profile.email, 'a@b.co');
  assert.equal(profile.signInProviderLabel(), 'Signed in with Apple and Google');
});

test('an email-code user has no provider line', () => {
  assert.equal(Profile.fromMe(newUser).signInProviderLabel(), null);
});

test('an unknown provider is not shown', () => {
  const profile = Profile.fromMe({
    user: { id: 'u1', oauthIdentities: [{ provider: 'other' }] },
    company,
  });
  assert.equal(profile.signInProviderLabel(), null);
});

test('a stable currency is labelled by its asset code', () => {
  assert.equal(Profile.currencyLabel('XLM.GBPLOOP'), 'GBPLOOP');
  assert.equal(Profile.currencyLabel('XLM'), 'XLM');
});

test('a country code becomes its flag', () => {
  assert.equal(Profile.countryFlag('GB'), '🇬🇧');
  assert.equal(Profile.countryFlag('gb'), '');
});
