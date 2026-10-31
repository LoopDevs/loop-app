import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ConfigContext } from 'expo/config';

import appConfig from '../../app.config.ts';
import {
  hasErrorCode,
  newSignInNonce,
  oauthLoginBody,
  signInRefusalMessage,
  SocialSignInConfig,
} from './social-sign-in.ts';

const allIds = new SocialSignInConfig({
  appleSignIn: 'true',
  googleWebClientId: '111-web.apps.googleusercontent.com',
  googleIosClientId: '222-ios.apps.googleusercontent.com',
});

test('no client ids shows only email sign-in everywhere', () => {
  const none = new SocialSignInConfig({ appleSignIn: ' ', googleWebClientId: '' });
  for (const platform of ['ios', 'android', 'web']) {
    assert.deepEqual(none.providers(platform), []);
  }
});

test('Apple sign-in is on only when the flag is true', () => {
  for (const appleSignIn of [undefined, '', 'false', '0', 'io.loopfinance.app']) {
    assert.deepEqual(new SocialSignInConfig({ appleSignIn }).providers('ios'), []);
  }
  assert.deepEqual(new SocialSignInConfig({ appleSignIn: ' true ' }).providers('ios'), ['apple']);
});

test('iOS shows Apple, and Google only beside Apple', () => {
  assert.deepEqual(allIds.providers('ios'), ['apple', 'google']);
  const appleOnly = new SocialSignInConfig({ appleSignIn: 'true' });
  assert.deepEqual(appleOnly.providers('ios'), ['apple']);
  const googleOnly = new SocialSignInConfig({
    googleWebClientId: '111-web.apps.googleusercontent.com',
    googleIosClientId: '222-ios.apps.googleusercontent.com',
  });
  assert.deepEqual(googleOnly.providers('ios'), []);
});

test('iOS needs the iOS client id for Google', () => {
  const noIosId = new SocialSignInConfig({
    appleSignIn: 'true',
    googleWebClientId: '111-web.apps.googleusercontent.com',
  });
  assert.deepEqual(noIosId.providers('ios'), ['apple']);
});

test('iOS hides Google when the iOS client id gives no URL scheme', () => {
  const malformedIosId = new SocialSignInConfig({
    appleSignIn: 'true',
    googleWebClientId: '111-web.apps.googleusercontent.com',
    googleIosClientId: '222-ios',
  });
  assert.deepEqual(malformedIosId.providers('ios'), ['apple']);
});

test('Android shows Google with the web client id and never Apple', () => {
  assert.deepEqual(allIds.providers('android'), ['google']);
  const appleOnly = new SocialSignInConfig({ appleSignIn: 'true' });
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

test('Android and web point Apple accounts to iPhone whatever the build sets for Apple', () => {
  for (const appleSignIn of ['true', 'false', undefined]) {
    const config = new SocialSignInConfig({ appleSignIn });
    for (const platform of ['android', 'web']) {
      assert.match(config.appleAccountHint(platform) ?? '', /Signed up with Apple on an iPhone/);
    }
  }
});

test('iOS shows the relay address hint only beside the Apple button', () => {
  assert.match(allIds.appleAccountHint('ios') ?? '', /relay address/);
  assert.equal(new SocialSignInConfig({ appleSignIn: 'false' }).appleAccountHint('ios'), null);
});

test('the app config is the same whatever the social sign-in env', () => {
  const keys = ['EXPO_PUBLIC_APPLE_SIGN_IN', 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'];
  const saved = keys.map((key) => process.env[key]);
  const configWith = (value: string | undefined) => {
    for (const key of keys) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    return appConfig({ config: {} } as ConfigContext);
  };
  try {
    const bare = configWith(undefined);
    assert.deepEqual(configWith('true'), bare);
    assert.deepEqual(configWith('333-ios.apps.googleusercontent.com'), bare);
    assert.equal(bare.ios?.usesAppleSignIn, true);
    assert.ok(bare.plugins?.includes('expo-apple-authentication'));
  } finally {
    keys.forEach((key, index) => {
      if (saved[index] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[index];
      }
    });
  }
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

test('oauthLoginBody carries the nonce the provider was given', () => {
  const nonce = newSignInNonce();
  assert.deepEqual(oauthLoginBody('apple', { idToken: 'token', nonce }), {
    provider: 'apple',
    idToken: 'token',
    nonce,
  });
});

test('oauthLoginBody omits the nonce when the provider took none', () => {
  assert.deepEqual(oauthLoginBody('google', { idToken: 'token' }), { provider: 'google', idToken: 'token' });
});

test('newSignInNonce is 64 hex characters and differs on every call', () => {
  const nonces = new Set(Array.from({ length: 50 }, () => newSignInNonce()));
  assert.equal(nonces.size, 50);
  for (const nonce of nonces) {
    assert.match(nonce, /^[0-9a-f]{64}$/);
  }
});
