import * as Sentry from '@sentry/react-native';

import { SentryScrubber } from '@/ops/sentry-scrubber';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export const errorReporting = {
  enabled: Boolean(dsn),

  init(): void {
    if (!dsn) {
      return;
    }
    Sentry.init({
      dsn,
      environment: process.env.EXPO_PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet',
      sendDefaultPii: false,
      tracesSampleRate: 0,
      enableNetworkBreadcrumbs: false,
      beforeSend: (event) => SentryScrubber.scrubEvent(event),
      beforeBreadcrumb: (breadcrumb) => SentryScrubber.scrubBreadcrumb(breadcrumb),
    });
  },

  reportMessage(message: string): void {
    if (dsn) {
      Sentry.captureMessage(message, 'error');
    }
  },
};
