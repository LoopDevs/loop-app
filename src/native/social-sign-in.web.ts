import type { SocialProvider } from '@/session/social-sign-in';

export const socialSignIn = {
  providers(): SocialProvider[] {
    return [];
  },

  async idToken(_provider: SocialProvider): Promise<string | null> {
    return null;
  },
};
