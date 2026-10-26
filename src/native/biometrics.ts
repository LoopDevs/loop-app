import * as LocalAuthentication from 'expo-local-authentication';

import type { AuthenticationResult } from '@/session/app-lock';

export const biometrics = {
  async isEnrolled(): Promise<boolean> {
    return (
      (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync())
    );
  },

  async authenticate(promptMessage: string): Promise<AuthenticationResult> {
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage });
      return result.success ? { success: true } : { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'unknown' };
    }
  },
};
