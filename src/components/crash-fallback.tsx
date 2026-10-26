import { Button } from '@/components/form';
import { RoyalScreen } from '@/components/royal-screen';

export function CrashFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <RoyalScreen
      title="Something went wrong"
      detail="A payment already sent is not lost. Check Orders for its status.">
      <Button label="Try again" variant="onRoyal" onPress={onRetry} />
    </RoyalScreen>
  );
}
