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

export type OAuthLoginBody = {
  provider: SocialProvider;
  idToken: string;
  nonce?: string;
};

const nonceByteLength = 32;

const providerNames: Record<SocialProvider, string> = {
  apple: 'Apple',
  google: 'Google',
};

const googleClientIdSuffix = '.apps.googleusercontent.com';

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
    if (platform !== 'ios') {
      return 'Signed up with Apple on an iPhone? Sign in with Apple on that iPhone, or enter the email you shared with Apple. If you hid your email, use the relay address shown in Settings on your iPhone.';
    }
    return this.appleSignIn
      ? 'Signed up with Apple and hid your email? Use the relay address shown in Settings on your iPhone.'
      : null;
  }
}

export function newSignInNonce(): string {
  return bytesToHex(randomBytes(nonceByteLength));
}

export function oauthLoginBody(provider: SocialProvider, credential: SocialCredential): OAuthLoginBody {
  const body: OAuthLoginBody = { provider, idToken: credential.idToken };
  if (credential.nonce) {
    body.nonce = credential.nonce;
  }
  return body;
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
