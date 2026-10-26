import { Stack } from 'expo-router';

export const unstable_settings = {
  anchor: 'index',
};

export default function OrdersLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Orders' }} />
      <Stack.Screen name="[id]" options={{ title: 'Gift card' }} />
    </Stack>
  );
}
