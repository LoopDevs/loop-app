import {
  GoogleSignin,
  isCancelledResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

import { loopEnvironment } from '@/environment';
import {
  hasErrorCode,
  newSignInNonce,
  SocialSignInConfig,
  socialProviderName,
  type SocialCredential,
  type SocialProvider,
} from '@/session/social-sign-in';

const config = new SocialSignInConfig({
  appleSignIn: process.env.EXPO_PUBLIC_APPLE_SIGN_IN,
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  googleIosClientId: loopEnvironment.googleIosClientId,
});

function requireIdToken(provider: SocialProvider, idToken: string | null): string {
  if (!idToken) {
    throw new Error(`${socialProviderName(provider)} didn't return a sign-in token. Try again.`);
  }
  return idToken;
}

async function appleCredential(): Promise<SocialCredential | null> {
  const nonce = newSignInNonce();
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce,
    });
    return { idToken: requireIdToken('apple', credential.identityToken), nonce };
  } catch (error) {
    if (hasErrorCode(error, 'ERR_REQUEST_CANCELED')) {
      return null;
    }
    throw error;
  }
}

async function googleCredential(): Promise<SocialCredential | null> {
  GoogleSignin.configure({
    webClientId: config.googleWebClientId,
    iosClientId: config.googleIosClientId || undefined,
  });
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    await GoogleSignin.signOut();
    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) {
      return null;
    }
    return { idToken: requireIdToken('google', response.data.idToken) };
  } catch (error) {
    if (hasErrorCode(error, statusCodes.SIGN_IN_CANCELLED)) {
      return null;
    }
    throw error;
  }
}

export const socialSignIn = {
  providers(): SocialProvider[] {
    return config.providers(Platform.OS);
  },

  appleAccountHint(): string | null {
    return config.appleAccountHint(Platform.OS);
  },

  credential(provider: SocialProvider): Promise<SocialCredential | null> {
    return provider === 'apple' ? appleCredential() : googleCredential();
  },
};
