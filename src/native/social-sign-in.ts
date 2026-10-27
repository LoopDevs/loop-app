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
  SocialSignInConfig,
  socialProviderName,
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

async function appleIdToken(): Promise<string | null> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
    return requireIdToken('apple', credential.identityToken);
  } catch (error) {
    if (hasErrorCode(error, 'ERR_REQUEST_CANCELED')) {
      return null;
    }
    throw error;
  }
}

async function googleIdToken(): Promise<string | null> {
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
    return requireIdToken('google', response.data.idToken);
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

  idToken(provider: SocialProvider): Promise<string | null> {
    return provider === 'apple' ? appleIdToken() : googleIdToken();
  },
};
