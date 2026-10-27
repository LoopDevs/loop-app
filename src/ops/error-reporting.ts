import * as Sentry from '@sentry/react-native';

import { loopEnvironment } from '@/environment';
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
      environment: loopEnvironment.name,
      sendDefaultPii: false,
      tracePropagationTargets: [],
      enableNetworkBreadcrumbs: false,
      integrations: [Sentry.breadcrumbsIntegration({ fetch: false, xhr: false })],
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
