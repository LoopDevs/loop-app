import type { ConfigContext, ExpoConfig } from 'expo/config';

import './src/environment.ts';
import { SocialSignInConfig } from './src/session/social-sign-in.ts';
import { criticalIndexFromEnv } from './src/updates/critical-update.ts';

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
  const easProjectId: string | undefined = config.extra?.eas?.projectId;
  const criticalIndex = criticalIndexFromEnv(process.env.LOOP_CRITICAL_INDEX);
  return {
    ...config,
    name: config.name ?? 'Loop',
    slug: config.slug ?? 'loop',
    ios: { ...config.ios, usesAppleSignIn },
    plugins,
    updates: easProjectId ? { ...config.updates, url: `https://u.expo.dev/${easProjectId}` } : config.updates,
    extra: criticalIndex === undefined ? config.extra : { ...config.extra, criticalIndex },
  };
};
