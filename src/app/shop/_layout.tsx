import { Stack } from 'expo-router';

import { FontFamily } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export const unstable_settings = {
  anchor: 'index',
};

export default function ShopLayout() {
  const theme = useTheme();
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Shop', headerShown: false }} />
      <Stack.Screen
        name="[slug]"
        options={{
          title: '',
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          headerTitleStyle: { fontFamily: FontFamily.semibold },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
    </Stack>
  );
}
