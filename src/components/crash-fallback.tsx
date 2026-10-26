import { Button } from '@/components/form';
import { MessageScreen } from '@/components/message-screen';

export function CrashFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <MessageScreen
      title="Something went wrong"
      detail="A payment already sent is not lost. Check Orders for its status.">
      <Button label="Try again" variant="primary" onPress={onRetry} />
    </MessageScreen>
  );
}
