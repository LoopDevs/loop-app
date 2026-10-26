import { useEffect } from 'react';
import { Platform } from 'react-native';

import { Button } from '@/components/form';
import { MessageScreen } from '@/components/message-screen';
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
      detail="A payment already sent is not lost. Check Orders for its status.">
      <Button label="Try again" variant="primary" onPress={retry} />
    </MessageScreen>
  );
}
