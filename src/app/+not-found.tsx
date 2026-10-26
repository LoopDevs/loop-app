import { useRouter } from 'expo-router';

import { Button } from '@/components/form';
import { RoyalScreen } from '@/components/royal-screen';

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <RoyalScreen title="Page not found" detail="This page doesn't exist.">
      <Button label="Go home" variant="onRoyal" onPress={() => router.replace('/')} />
    </RoyalScreen>
  );
}
