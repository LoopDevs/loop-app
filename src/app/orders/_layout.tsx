import { Stack } from 'expo-router';

import { Brand, FontFamily } from '@/constants/theme';

export const unstable_settings = {
  anchor: 'index',
};

const royalHeader = {
  title: '',
  headerStyle: { backgroundColor: Brand.royal },
  headerTintColor: Brand.onRoyal,
  headerTitleStyle: { fontFamily: FontFamily.semibold },
  headerShadowVisible: false,
  headerBackButtonDisplayMode: 'minimal',
} as const;

export default function OrdersLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Orders', headerShown: false }} />
      <Stack.Screen name="[id]" options={royalHeader} />
      <Stack.Screen name="cashback" options={royalHeader} />
    </Stack>
  );
}
