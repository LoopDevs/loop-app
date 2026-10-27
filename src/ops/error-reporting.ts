import * as Sentry from '@sentry/react-native';

import { loopEnvironment } from '@/environment';
import { ReportableError } from '@/ops/reportable-error';
import { SentryScrubber } from '@/ops/sentry-scrubber';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

const reportedOnce = new Set<string>();
const reportedErrors = new WeakSet<object>();

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

  reportError(error: unknown, context: string): boolean {
    if (!dsn || !ReportableError.isAnomaly(error)) {
      return false;
    }
    if (typeof error === 'object' && error !== null) {
      if (reportedErrors.has(error)) {
        return false;
      }
      reportedErrors.add(error);
    }
    Sentry.captureException(ReportableError.summary(error, context));
    return true;
  },

  reportErrorOnce(error: unknown, context: string): void {
    if (!reportedOnce.has(context) && errorReporting.reportError(error, context)) {
      reportedOnce.add(context);
    }
  },

  reportCrash(error: unknown, context: string): void {
    if (dsn) {
      Sentry.captureException(ReportableError.summary(error, context));
    }
  },
};
