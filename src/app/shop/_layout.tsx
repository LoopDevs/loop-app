import { Stack } from 'expo-router';

import { Brand, FontFamily } from '@/constants/theme';

export const unstable_settings = {
  anchor: 'index',
};

export default function ShopLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Shop', headerShown: false }} />
      <Stack.Screen
        name="[slug]"
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
