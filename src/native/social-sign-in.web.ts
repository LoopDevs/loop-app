import { SocialSignInConfig, type SocialCredential, type SocialProvider } from '@/session/social-sign-in';

const config = new SocialSignInConfig({});

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
