import { SocialSignInConfig, type SocialCredential, type SocialProvider } from '@/session/social-sign-in';

const config = new SocialSignInConfig({
  appleSignIn: process.env.EXPO_PUBLIC_APPLE_SIGN_IN,
});

export const socialSignIn = {
  providers(): SocialProvider[] {
    return [];
  },

  appleAccountHint(): string | null {
    return config.appleAccountHint('web');
  },

  async credential(_provider: SocialProvider): Promise<SocialCredential | null> {
    return null;
  },
};
