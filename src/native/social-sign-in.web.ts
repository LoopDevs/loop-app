import { SocialSignInConfig, type SocialProvider } from '@/session/social-sign-in';

const config = new SocialSignInConfig({});

export const socialSignIn = {
  providers(): SocialProvider[] {
    return [];
  },

  appleAccountHint(): string | null {
    return config.appleAccountHint('web');
  },

  async idToken(_provider: SocialProvider): Promise<string | null> {
    return null;
  },
};
