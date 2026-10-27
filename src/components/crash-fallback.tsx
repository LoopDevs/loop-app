import type { ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { Button } from '@/components/form';
import { ContactSupportButton, MessageScreen } from '@/components/message-screen';
import { errorReporting } from '@/ops/error-reporting';
import { StaleBuild } from '@/ops/stale-build';

export function CrashFallback({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const staleBuild = Platform.OS === 'web' && StaleBuild.caused(error);
  useEffect(() => {
    if (staleBuild) {
      StaleBuild.reloadOnce();
    }
  }, [staleBuild]);
  const retry = staleBuild ? () => window.location.reload() : onRetry;
  return (
    <MessageScreen
      title="Something went wrong"
      detail="A payment already sent is not lost. Check Wallet for its status.">
      <Button label="Try again" variant="primary" onPress={retry} />
      <ContactSupportButton subject="Loop app error" />
    </MessageScreen>
  );
}

export function ScreenCrash({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    errorReporting.reportCrash(error, 'Screen render');
  }, [error]);
  return <CrashFallback error={error} onRetry={() => void retry()} />;
}
