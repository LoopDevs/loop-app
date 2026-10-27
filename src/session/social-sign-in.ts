import { bytesToHex, randomBytes } from '@noble/hashes/utils';

export type SocialProvider = 'apple' | 'google';

export type SignInMethod = 'email' | SocialProvider;

export type SocialSignInEnv = {
  appleSignIn?: string;
  googleWebClientId?: string;
  googleIosClientId?: string;
};

export type SocialCredential = {
  idToken: string;
  nonce?: string;
};

export type OAuthLoginBody = SocialCredential & {
  provider: SocialProvider;
};

const providerNames: Record<SocialProvider, string> = {
  apple: 'Apple',
  google: 'Google',
};

const googleClientIdSuffix = '.apps.googleusercontent.com';

export const googleIosClientId = '';

export class SocialSignInConfig {
  readonly appleSignIn: boolean;
  readonly googleWebClientId: string;
  readonly googleIosClientId: string;

  constructor(env: SocialSignInEnv) {
    this.appleSignIn = env.appleSignIn?.trim() === 'true';
    this.googleWebClientId = env.googleWebClientId?.trim() ?? '';
    this.googleIosClientId = env.googleIosClientId?.trim() ?? '';
  }

  providers(platform: string): SocialProvider[] {
    switch (platform) {
      case 'ios':
        if (!this.appleSignIn) {
          return [];
        }
        return this.googleWebClientId && this.googleIosUrlScheme() ? ['apple', 'google'] : ['apple'];
      case 'android':
        return this.googleWebClientId ? ['google'] : [];
      default:
        return [];
    }
  }

  googleIosUrlScheme(): string | null {
    if (!this.googleIosClientId.endsWith(googleClientIdSuffix)) {
      return null;
    }
    const prefix = this.googleIosClientId.slice(0, -googleClientIdSuffix.length);
    return prefix ? `com.googleusercontent.apps.${prefix}` : null;
  }

  appleAccountHint(platform: string): string | null {
    if (!this.appleSignIn) {
      return null;
    }
    return platform === 'ios'
      ? 'Signed up with Apple and hid your email? Use the relay address shown in Settings on your iPhone.'
      : 'Signed up with Apple on an iPhone? Sign in with Apple on that iPhone, or enter the email you shared with Apple. If you hid your email, use the relay address shown in Settings on your iPhone.';
  }
}

export function newSignInNonce(): string {
  return bytesToHex(randomBytes(32));
}

export function oauthLoginBody(provider: SocialProvider, credential: SocialCredential): OAuthLoginBody {
  const { idToken, nonce } = credential;
  return nonce ? { provider, idToken, nonce } : { provider, idToken };
}

export function socialProviderName(provider: SocialProvider): string {
  return providerNames[provider];
}

export function hasErrorCode(error: unknown, code: string): boolean {
  return !!error && typeof error === 'object' && 'code' in error && String(error.code) === code;
}

export function signInRefusalMessage(method: SignInMethod, errorName: string | undefined): string | null {
  if (method === 'email') {
    return errorName === 'ErrAuthMethodNotAllowedForUser'
      ? 'Email sign-in is turned off for this account. Contact support.'
      : null;
  }
  const name = socialProviderName(method);
  switch (errorName) {
    case 'ErrOAuthEmailUnverified':
      return `${name} hasn't verified the email on this account. Sign in with your email instead.`;
    case 'ErrUserSignupNotAllowed':
    case 'ErrUserCreationDisabled':
      return `New accounts can't sign up with ${name} right now. Sign in with your email instead.`;
    case 'ErrUserTypeNotAllowed':
      return `This account can't sign in with ${name}. Sign in with your email instead.`;
    default:
      return null;
  }
}
