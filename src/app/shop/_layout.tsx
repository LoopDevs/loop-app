import { Stack } from 'expo-router';

export const unstable_settings = {
  anchor: 'index',
};

export default function ShopLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Shop', headerShown: false }} />
      <Stack.Screen name="[slug]" options={{ title: '' }} />
    </Stack>
  );
}
