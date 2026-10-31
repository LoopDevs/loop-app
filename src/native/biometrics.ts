import * as LocalAuthentication from 'expo-local-authentication';

import type { AuthenticationResult } from '@/session/app-lock';

export const biometrics = {
  async hasScreenLock(): Promise<boolean> {
    return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE;
  },

  async confirmUser(promptMessage: string): Promise<AuthenticationResult> {
    try {
      if (!(await biometrics.hasScreenLock())) {
        return { success: true };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'unknown' };
    }
    return biometrics.authenticate(promptMessage);
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
