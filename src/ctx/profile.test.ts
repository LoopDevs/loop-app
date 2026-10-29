import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { CashbackDestination, MeJson } from './client.ts';
import { Profile } from './profile.ts';

const company = {
  countries: ['US', 'GB', 'CA'],
  stableCurrencies: ['XLM.USDC', 'XLM.GBPLOOP', 'XLM.UNLISTED'],
};

const newUser: MeJson = { user: { id: 'u1' }, company };

test('a new user needs setup and a currency choice', () => {
  const profile = Profile.fromMe(newUser);
  assert.equal(profile.needsSetup(), true);
  assert.equal(profile.needsCurrencyChoice(), true);
});

test('only offered currencies are given as a choice', () => {
  assert.deepEqual(Profile.fromMe(newUser).stableCurrencies, ['XLM.USDC', 'XLM.GBPLOOP']);
});

test('a company currency that is not offered is never sent', () => {
  const profile = Profile.fromMe(newUser);
  assert.equal(profile.nextUpdate({ country: 'GB', stableCurrency: 'XLM.UNLISTED' }), null);
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

test('the passkey is labelled with the account email', () => {
  const relay = { id: 'u1', email: 'abc123@privaterelay.appleid.com' };
  assert.equal(Profile.fromMe({ user: relay, company }).passkeyLabel(), 'abc123@privaterelay.appleid.com');
  assert.equal(Profile.fromMe(newUser).passkeyLabel(), 'Loop wallet');
});

test('a stable currency is labelled by its asset code', () => {
  assert.equal(Profile.currencyLabel('XLM.GBPLOOP'), 'British Pound');
  assert.equal(Profile.currencyLabel('XLM.USDC'), 'US Dollar');
  assert.equal(Profile.currencyLabel('XLM'), 'XLM');
});

test('a country code becomes its flag', () => {
  assert.equal(Profile.countryFlag('GB'), '🇬🇧');
  assert.equal(Profile.countryFlag('gb'), '');
});

function destinationProfile(stableCurrency: string | undefined, cashbackDestination?: CashbackDestination) {
  return Profile.fromMe({ user: { id: 'u1', stableCurrency, cashbackDestination }, company });
}

test('a user whose cashback currency savings takes can choose either destination', () => {
  assert.deepEqual(destinationProfile('XLM.USDC', 'account').cashbackDestinations(), ['account', 'savings']);
});

test('a user whose cashback currency savings does not take sees account only', () => {
  for (const stableCurrency of ['XLM.GBPLOOP', 'XLM.EURC', '', undefined]) {
    const profile = destinationProfile(stableCurrency, 'account');
    assert.deepEqual(profile.cashbackDestinations(), ['account'], String(stableCurrency));
    assert.equal(profile.destinationUpdate('savings'), null);
  }
});

test('a saver in a currency savings does not take can still leave savings', () => {
  const profile = destinationProfile('XLM.GBPLOOP', 'savings');
  assert.deepEqual(profile.cashbackDestinations(), ['account', 'savings']);
  assert.deepEqual(profile.destinationUpdate('account'), { cashbackDestination: 'account' });
});

test('choosing the other destination sends only the destination', () => {
  assert.deepEqual(destinationProfile('XLM.USDC', 'account').destinationUpdate('savings'), {
    cashbackDestination: 'savings',
  });
});

test('choosing the active destination sends nothing', () => {
  assert.equal(destinationProfile('XLM.USDC', 'savings').destinationUpdate('savings'), null);
  assert.equal(destinationProfile('XLM.USDC', 'account').destinationUpdate('account'), null);
});

test('a missing destination reads as account', () => {
  const profile = destinationProfile('XLM.USDC');
  assert.equal(profile.cashbackDestination, 'account');
  assert.equal(profile.savesCashback(), false);
});

test('the destination follows the saved user', () => {
  const saved = destinationProfile('XLM.USDC', 'account').withUser({
    id: 'u1',
    stableCurrency: 'XLM.USDC',
    cashbackDestination: 'savings',
  });
  assert.equal(saved.savesCashback(), true);
});

test('an update applies locally and keeps the rest of the user', () => {
  const profile = Profile.fromMe({
    user: { id: 'u1', email: 'a@b.co', stableCurrency: 'XLM.USDC', oauthIdentities: [{ provider: 'apple' }] },
    company,
  });
  const updated = profile.withUpdate({ cashbackDestination: 'savings' });
  assert.equal(updated.savesCashback(), true);
  assert.equal(updated.email, 'a@b.co');
  assert.equal(updated.stableCurrency, 'XLM.USDC');
  assert.equal(updated.signInProviderLabel(), 'Signed in with Apple');
  assert.deepEqual(updated.cashbackDestinations(), profile.cashbackDestinations());
  assert.equal(profile.savesCashback(), false);
});
