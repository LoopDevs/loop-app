import { Stack } from 'expo-router';

import { FontFamily } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export const unstable_settings = {
  anchor: 'index',
};

export default function WalletLayout() {
  const theme = useTheme();
  const detailHeader = {
    title: '',
    headerStyle: { backgroundColor: theme.background },
    headerTintColor: theme.text,
    headerTitleStyle: { fontFamily: FontFamily.semibold },
    headerShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal',
  } as const;

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Wallet', headerShown: false }} />
      <Stack.Screen name="[id]" options={detailHeader} />
      <Stack.Screen name="cashback" options={detailHeader} />
      <Stack.Screen name="cash-out" options={detailHeader} />
    </Stack>
  );
}
