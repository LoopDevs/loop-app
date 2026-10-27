import type { ConfigContext, ExpoConfig } from 'expo/config';

import './src/environment.ts';
import { googleIosClientId, SocialSignInConfig } from './src/session/social-sign-in.ts';

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleIosUrlScheme = new SocialSignInConfig({ googleIosClientId }).googleIosUrlScheme();
  const plugins: ExpoConfig['plugins'] = [...(config.plugins ?? []), 'expo-apple-authentication'];
  if (googleIosUrlScheme) {
    plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }]);
  }
  return {
    ...config,
    name: config.name ?? 'Loop',
    slug: config.slug ?? 'loop',
    ios: { ...config.ios, usesAppleSignIn: true },
    plugins,
  };
};
