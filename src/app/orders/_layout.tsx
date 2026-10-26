import { Stack } from 'expo-router';

import { Brand, FontFamily } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export const unstable_settings = {
  anchor: 'index',
};

export default function OrdersLayout() {
  const theme = useTheme();
  const header = {
    headerStyle: { backgroundColor: theme.background },
    headerTintColor: theme.accent,
    headerTitleStyle: { fontFamily: FontFamily.semibold, color: theme.text },
    headerShadowVisible: false,
  };
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Orders', headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: 'Gift card', ...header }} />
      <Stack.Screen
        name="cashback"
        options={{
          title: '',
          headerStyle: { backgroundColor: Brand.royal },
          headerTintColor: Brand.onRoyal,
          headerTitleStyle: { fontFamily: FontFamily.semibold },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
    </Stack>
  );
}
