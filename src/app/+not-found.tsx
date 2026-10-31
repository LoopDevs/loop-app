import { Stack, useRouter } from 'expo-router';

import { Button } from '@/components/ui/form';
import { MessageScreen } from '@/components/message-screen';

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <MessageScreen title="Page not found" detail="This page doesn't exist.">
      <Stack.Screen options={{ title: 'Page not found' }} />
      <Button label="Go home" variant="primary" onPress={() => router.replace('/')} />
    </MessageScreen>
  );
}
