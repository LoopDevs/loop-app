import type { ConfigContext, ExpoConfig } from 'expo/config';

import { loopEnvironment } from './src/environment.ts';
import { SocialSignInConfig } from './src/session/social-sign-in.ts';
import { criticalIndexFromEnv } from './src/updates/critical-update.ts';

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleIosUrlScheme = new SocialSignInConfig({
    googleIosClientId: loopEnvironment.googleIosClientId,
  }).googleIosUrlScheme();
  const plugins: ExpoConfig['plugins'] = [...(config.plugins ?? []), 'expo-apple-authentication'];
  if (googleIosUrlScheme) {
    plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }]);
  }
  const easProjectId: string | undefined = config.extra?.eas?.projectId;
  const criticalIndex = criticalIndexFromEnv(process.env.LOOP_CRITICAL_INDEX);
  return {
    ...config,
    name: config.name ?? 'Loop',
    slug: config.slug ?? 'loop',
    ios: { ...config.ios, usesAppleSignIn: true },
    plugins,
    updates: easProjectId ? { ...config.updates, url: `https://u.expo.dev/${easProjectId}` } : config.updates,
    extra: criticalIndex === undefined ? config.extra : { ...config.extra, criticalIndex },
  };
};
