import type { ConfigContext, ExpoConfig } from 'expo/config';

import { SocialSignInConfig } from './src/session/social-sign-in.ts';

export default ({ config }: ConfigContext): ExpoConfig => {
  const socialSignIn = new SocialSignInConfig({
    appleSignIn: process.env.EXPO_PUBLIC_APPLE_SIGN_IN,
    googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
  const usesAppleSignIn = socialSignIn.providers('ios').includes('apple');
  const googleIosUrlScheme = socialSignIn.googleIosUrlScheme();
  const plugins: ExpoConfig['plugins'] = [...(config.plugins ?? [])];
  if (usesAppleSignIn) {
    plugins.push('expo-apple-authentication');
  }
  if (googleIosUrlScheme) {
    plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }]);
  }
  return {
    ...config,
    name: config.name ?? 'Loop',
    slug: config.slug ?? 'loop',
    ios: { ...config.ios, usesAppleSignIn },
    plugins,
  };
};
