import { Stack, useRouter } from 'expo-router';

import { Button } from '@/components/ui/form';
import { MessageScreen } from '@/components/message-screen';
import { PageTitle } from '@/components/page-title';

export default function BankReturnScreen() {
  const router = useRouter();
  return (
    <MessageScreen title="Finish in the Loop app" detail="Open the Loop app to see your payment.">
      <Stack.Screen options={{ title: 'Finish in the Loop app' }} />
      <PageTitle title="Finish in the Loop app" />
      <Button label="Go home" variant="primary" onPress={() => router.replace('/')} />
    </MessageScreen>
  );
}
