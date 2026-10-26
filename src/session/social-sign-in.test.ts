import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  hasErrorCode,
  oauthLoginBody,
  signInRefusalMessage,
  SocialSignInConfig,
} from './social-sign-in.ts';

const allIds = new SocialSignInConfig({
  appleClientId: 'io.loopfinance.app',
  googleWebClientId: '111-web.apps.googleusercontent.com',
  googleIosClientId: '222-ios.apps.googleusercontent.com',
});

test('no client ids shows only email sign-in everywhere', () => {
  const none = new SocialSignInConfig({ appleClientId: ' ', googleWebClientId: '' });
  for (const platform of ['ios', 'android', 'web']) {
    assert.deepEqual(none.providers(platform), []);
  }
});

test('iOS shows Apple, and Google only beside Apple', () => {
  assert.deepEqual(allIds.providers('ios'), ['apple', 'google']);
  const appleOnly = new SocialSignInConfig({ appleClientId: 'io.loopfinance.app' });
  assert.deepEqual(appleOnly.providers('ios'), ['apple']);
  const googleOnly = new SocialSignInConfig({
    googleWebClientId: '111-web.apps.googleusercontent.com',
    googleIosClientId: '222-ios.apps.googleusercontent.com',
  });
  assert.deepEqual(googleOnly.providers('ios'), []);
});

test('iOS needs the iOS client id for Google', () => {
  const noIosId = new SocialSignInConfig({
    appleClientId: 'io.loopfinance.app',
    googleWebClientId: '111-web.apps.googleusercontent.com',
  });
  assert.deepEqual(noIosId.providers('ios'), ['apple']);
});

test('Android shows Google with the web client id and never Apple', () => {
  assert.deepEqual(allIds.providers('android'), ['google']);
  const appleOnly = new SocialSignInConfig({ appleClientId: 'io.loopfinance.app' });
  assert.deepEqual(appleOnly.providers('android'), []);
});

test('web shows no social buttons', () => {
  assert.deepEqual(allIds.providers('web'), []);
});

test('the Google iOS URL scheme is the reversed iOS client id', () => {
  assert.equal(allIds.googleIosUrlScheme(), 'com.googleusercontent.apps.222-ios');
  assert.equal(new SocialSignInConfig({}).googleIosUrlScheme(), null);
  assert.equal(new SocialSignInConfig({ googleIosClientId: 'not-a-client-id' }).googleIosUrlScheme(), null);
  assert.equal(
    new SocialSignInConfig({ googleIosClientId: '.apps.googleusercontent.com' }).googleIosUrlScheme(),
    null,
  );
});

test('the OAuth login body carries provider and token and no nonce', () => {
  const body = oauthLoginBody('apple', 'header.payload.signature');
  assert.deepEqual(body, { provider: 'apple', idToken: 'header.payload.signature' });
  assert.equal('nonce' in body, false);
});

test('social refusals point to email sign-in', () => {
  assert.equal(
    signInRefusalMessage('apple', 'ErrOAuthEmailUnverified'),
    "Apple hasn't verified the email on this account. Sign in with your email instead.",
  );
  assert.equal(
    signInRefusalMessage('google', 'ErrUserSignupNotAllowed'),
    "New accounts can't sign up with Google right now. Sign in with your email instead.",
  );
  assert.equal(
    signInRefusalMessage('google', 'ErrUserCreationDisabled'),
    signInRefusalMessage('google', 'ErrUserSignupNotAllowed'),
  );
  assert.equal(
    signInRefusalMessage('apple', 'ErrUserTypeNotAllowed'),
    "This account can't sign in with Apple. Sign in with your email instead.",
  );
});

test('other CTX errors keep the CTX message', () => {
  assert.equal(signInRefusalMessage('google', 'ErrAuthMethodNotAllowed'), null);
  assert.equal(signInRefusalMessage('apple', 'ErrOAuthTokenInvalid'), null);
  assert.equal(signInRefusalMessage('apple', undefined), null);
});

test('email sign-in turned off for the account reads plainly', () => {
  assert.equal(
    signInRefusalMessage('email', 'ErrAuthMethodNotAllowedForUser'),
    'Email sign-in is turned off for this account. Contact support.',
  );
  assert.equal(signInRefusalMessage('email', 'ErrOAuthEmailUnverified'), null);
});

test('error codes match as strings', () => {
  assert.equal(hasErrorCode({ code: 'ERR_REQUEST_CANCELED' }, 'ERR_REQUEST_CANCELED'), true);
  assert.equal(hasErrorCode({ code: 12501 }, '12501'), true);
  assert.equal(hasErrorCode(new Error('x'), 'ERR_REQUEST_CANCELED'), false);
  assert.equal(hasErrorCode(null, 'ERR_REQUEST_CANCELED'), false);
});
