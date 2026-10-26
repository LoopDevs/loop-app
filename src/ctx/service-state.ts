export type ServiceState = 'maintenance' | 'purchases-paused' | 'app-disabled';

export type BlockingServiceState = Exclude<ServiceState, 'purchases-paused'>;

export type RecoveryProbe = 'GET /status' | 'GET /me' | 'sign-in';

export const serviceStateMessages: Record<ServiceState, string> = {
  maintenance: 'Loop is down for maintenance',
  'purchases-paused': 'Gift card purchases are paused, try again later',
  'app-disabled': 'Loop is unavailable right now',
};

export function serviceState(errorName: string | undefined): ServiceState | null {
  switch (errorName) {
    case 'ErrMaintenanceMode':
      return 'maintenance';
    case 'ErrKillSwitchActive':
      return 'purchases-paused';
    case 'ErrClientDisabled':
      return 'app-disabled';
    default:
      return null;
  }
}

export function blockingServiceState(errorName: string | undefined): BlockingServiceState | null {
  const state = serviceState(errorName);
  return state === 'purchases-paused' ? null : state;
}

export function recoveryProbe(state: BlockingServiceState, signedIn: boolean): RecoveryProbe {
  if (state === 'maintenance') {
    return 'GET /status';
  }
  return signedIn ? 'GET /me' : 'sign-in';
}
